#!/usr/bin/env python3
"""Fluxentiq AI Bridge — Groq streaming handlers and workflow event triggers.

Serves the real-time AI surface for the Fluxentiq HR platform:

    POST /health
    POST /api/ai/evaluate-candidate   → SSE stream (match scoring)
    POST /api/ai/copilot              → SSE stream (assistant + action cards)
    POST /api/ai/evaluate-pto         → JSON (automated leave decision)
    POST /api/workflows/trigger       → JSON (workflow event trigger)

Run it with:

    uvicorn server:app --reload --port 8000
    # or, after `pip install -r requirements.txt`:
    python server.py

The Next.js application proxies ``/api/ai/*`` and ``/api/workflows/*`` to this
process (see ``AI_BRIDGE_URL``), keeping the browser/E2E contract intact.

Token echo: every AI endpoint now returns X-Prompt-Tokens, X-Completion-Tokens,
X-Model, X-Feature, X-Cost-Usd headers so the Next.js proxy can accurately meter
streaming and non-streaming calls (Epic A).
"""

from __future__ import annotations

import json
import resource
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from bridge.config import settings
from bridge.ai_client import AiClient, GroqError
from bridge.models import (
    AiTestRequest,
    CandidateEvaluationRequest,
    CopilotRequest,
    InsightsRequest,
    InterviewReportRequest,
    PtoEvaluationRequest,
    RankCandidatesRequest,
    ResumeParseRequest,
    WorkflowTriggerRequest,
)
from bridge.providers import make_provider
from bridge.providers.base import ProviderError
from bridge.supabase_client import SupabaseClient, SupabaseError
from bridge.tools import make_executor
from bridge.usage import make_recorder
from bridge.workflow_engine import make_engine
from bridge.workflow_processor import make_processor as make_workflow_batch_processor
from bridge.engine_routes import router as engine_router
from bridge.jobs import default_registry
from bridge.logging import setup_json_logging
from bridge.rate_limit import SlidingWindowRateLimiter
from bridge.security import is_public_path, verify_bridge_secret
from bridge.cost import estimate_cost

# Structured JSON logging across every bridge module.
setup_json_logging()

import logging

logger = logging.getLogger("fluxentiq.bridge")

ai: AiClient | None = None
supabase: SupabaseClient | None = None
workflow_engine = None
workflow_batch_processor = None
tool_executor = None
usage_recorder = None
jobs = default_registry
rate_limiter: SlidingWindowRateLimiter | None = None
_started_at = time.time()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global ai, supabase, workflow_engine, workflow_batch_processor, tool_executor, usage_recorder, rate_limiter

    try:
        provider = make_provider()
        ai = AiClient(provider)
        logger.info(
            "AI ready — provider=%s model=%s",
            settings.llm_provider,
            provider.model,
        )
    except Exception as exc:  # noqa: BLE001 — never block startup on AI config
        logger.warning("AI provider not configured: %s", exc)

    if settings.supabase_configured:
        supabase = SupabaseClient(
            settings.supabase_url, settings.supabase_service_role_key
        )
        logger.info("Supabase client ready (%s)", settings.supabase_url)
    else:
        logger.warning("Supabase not configured — workflow persistence disabled.")

    if settings.bridge_secret_configured:
        logger.info("Bridge auth enabled (BRIDGE_SECRET_KEY set).")
    else:
        logger.warning(
            "BRIDGE_SECRET_KEY is NOT set — all /api/* endpoints will fail closed "
            "with 401 until the secret is configured."
        )

    workflow_engine = make_engine(supabase)
    workflow_batch_processor = make_workflow_batch_processor(supabase, ai)
    tool_executor = make_executor(supabase)
    usage_recorder = make_recorder(supabase)
    rate_limiter = SlidingWindowRateLimiter(
        limit=settings.rate_limit_per_window,
        window_seconds=settings.rate_limit_window_seconds,
    )
    logger.info(
        "rate limiter ready — limit=%s per %ss",
        settings.rate_limit_per_window,
        settings.rate_limit_window_seconds,
    )
    logger.info("workflow batch processor ready — ai digest + scoring + anomaly detection")
    yield

    if ai:
        await ai.aclose()
    if supabase:
        await supabase.aclose()


app = FastAPI(
    title="Fluxentiq AI Bridge",
    version="1.0.0",
    lifespan=lifespan,
)

# ML engine endpoints (python_engine/*) — deterministic utilities exposed over
# the same bridge as the LLM handlers.
app.include_router(engine_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def bridge_auth_middleware(request: Request, call_next):
    """Rejects unauthenticated requests to all functional endpoints (fail-closed).

    ``/health``, the OpenAPI schema and docs remain public (no tenant data).
    CORS preflight (OPTIONS) is allowed through so the CORS middleware can
    answer it. Everything else must present the shared secret.
    """

    path = request.url.path
    if request.method == "OPTIONS" or is_public_path(path):
        return await call_next(request)

    if not verify_bridge_secret(
        request.headers.get("authorization"),
        request.headers.get("x-bridge-secret"),
    ):
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized: invalid or missing bridge secret."},
        )

    # Per-tenant rate limiting (sliding window). Key on organization_id header,
    # falling back to the client IP, then a shared anonymous bucket. Polling and
    # non-AI endpoints are exempt so status checks never trip the budget.
    if rate_limiter is not None and path.startswith("/api/ai"):
        org_id = request.headers.get("x-organization-id") or ""
        ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        key = org_id or ip or "anonymous"
        allowed, retry_after = rate_limiter.allow(key)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again shortly."},
                headers={"Retry-After": str(max(1, int(retry_after) + 1))},
            )

    return await call_next(request)


def _sse(data: dict[str, Any] | str) -> str:
    """Serializes one SSE event (JSON data line + blank line)."""
    payload = data if isinstance(data, str) else json.dumps(data, default=str)
    return f"data: {payload}\n\n"


def _require_ai() -> AiClient:
    if ai is None:
        raise HTTPException(
            status_code=503,
            detail="No AI provider is configured (set LLM_PROVIDER / LLM_API_KEY).",
        )
    return ai


def _org_id_from_request(request: Request | None, context: dict[str, Any] | None = None) -> str | None:
    """Resolves organization_id from header or copilot context."""
    if request is not None:
        header_org = request.headers.get("x-organization-id")
        if header_org:
            return header_org.strip() or None
    if context is not None:
        ctx_org = context.get("organization_id")
        if ctx_org:
            return str(ctx_org).strip() or None
    return None


async def _meter(
    feature: str,
    model: str,
    organization_id: str | None = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> float:
    """Records AI usage (tokens + cost) after a successful call (best-effort). Returns cost."""
    if usage_recorder is not None:
        cost = await usage_recorder.record(
            feature=feature,
            model=model,
            organization_id=organization_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        return cost
    # Fallback when no recorder — still compute cost for header echo
    return estimate_cost(model, prompt_tokens, completion_tokens)


def _token_headers(
    feature: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float | None = None,
) -> dict[str, str]:
    """Builds the token echo headers for the Next.js proxy."""
    if usage_recorder is not None and hasattr(usage_recorder, "token_headers"):
        return usage_recorder.token_headers(
            feature=feature,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
        )
    # Fallback
    if cost_usd is None:
        cost_usd = estimate_cost(model, prompt_tokens, completion_tokens)
    return {
        "X-Prompt-Tokens": str(prompt_tokens),
        "X-Completion-Tokens": str(completion_tokens),
        "X-Model": model,
        "X-Feature": feature,
        "X-Cost-Usd": f"{cost_usd:.8f}",
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    """Liveness + capacity: uptime, queue depth, and process memory."""
    mem = resource.getrusage(resource.RUSAGE_SELF)
    return {
        "status": "ok",
        "service": "fluxentiq-ai-bridge",
        "uptime_seconds": round(time.time() - _started_at, 3),
        "queue_depth": await jobs.queue_depth(),
        "memory": {
            "maxrss_kb": getattr(mem, "ru_maxrss", 0),
        },
        "ai": {
            "configured": ai is not None,
            "provider": settings.llm_provider,
            "model": ai.model if ai else None,
        },
        "supabase": {"configured": settings.supabase_configured},
    }


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str):
    """Polls a background job's status/result (or 404 if unknown)."""
    job = await jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job_id.")
    return job.to_dict()


@app.post("/api/ai/test")
async def test_ai(payload: AiTestRequest | None = None):
    """Verifies the configured AI provider with a minimal completion.

    Accepts optional overrides (`provider`, `model`, `baseUrl`) so the
    Next.js test-connection route can validate alternative Groq models and
    custom OpenAI-compatible endpoints without mutating stored settings.
    """
    if payload is not None and (
        payload.provider or payload.model or payload.base_url
    ):
        try:
            client = AiClient(
                make_provider(
                    provider=payload.provider,
                    model=payload.model,
                    base_url=payload.base_url,
                )
            )
        except ProviderError as exc:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "message": str(exc)},
            )
    else:
        client = _require_ai()

    try:
        await client._provider.complete_json(
            [
                {
                    "role": "system",
                    "content": 'Respond with JSON only: {"ok": true}',
                },
                {"role": "user", "content": "ping"},
            ]
        )
        endpoint = getattr(client._provider, "endpoint", None)
        provider_name = client.provider_name or settings.llm_provider
        return {
            "ok": True,
            "provider": provider_name,
            "model": client.model,
            "endpoint": endpoint,
            "message": f"Connected to {provider_name} ({client.model}).",
        }
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=502,
            content={"ok": False, "message": str(exc)},
        )


@app.post("/api/ai/evaluate-candidate")
async def evaluate_candidate(
    http_request: Request,
    request: CandidateEvaluationRequest,
):
    """Streams a Groq candidate screening (deltas → structured evaluation)."""
    client = _require_ai()
    org_id = _org_id_from_request(http_request)

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in client.stream_candidate_evaluation(request):
                yield _sse(event)
            yield _sse("[DONE]")
            pt, ct = client.last_usage()
            await _meter(
                "candidate_evaluation",
                client.model,
                organization_id=org_id,
                prompt_tokens=pt,
                completion_tokens=ct,
            )
        except GroqError as exc:
            logger.error("candidate evaluation failed: %s", exc)
            yield _sse({"type": "error", "message": str(exc)})

    # Streaming: include model + feature headers at start (tokens unknown until end,
    # but bridge still meters via _meter and Next.js proxy reads model header).
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Model": client.model,
            "X-Feature": "candidate_evaluation",
        },
    )


@app.post("/api/ai/copilot")
async def copilot(
    http_request: Request,
    request: CopilotRequest,
):
    """Streams a Copilot reply (deltas → text + action cards + tool execution)."""
    client = _require_ai()
    org_id = _org_id_from_request(http_request, request.context)

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in client.stream_copilot(request):
                yield _sse(event)
                if event.get("type") == "done" and request.execute_tools:
                    # Execute any tool calls and emit their results. The Next.js
                    # agentic orchestrator passes execute_tools=False and runs
                    # the tools itself against its RBAC-guarded CRUD routes.
                    result = event.get("result") or {}
                    organization_id = request.context.get("organization_id") or org_id
                    for call in result.get("tool_calls", []):
                        from bridge.models import ToolCall

                        tool_result = await tool_executor.execute(
                            ToolCall(**call), organization_id
                        )
                        yield _sse(
                            {"type": "tool_result", "result": tool_result.model_dump()}
                        )
            yield _sse("[DONE]")
            pt, ct = client.last_usage()
            await _meter(
                "copilot",
                client.model,
                organization_id=org_id or request.context.get("organization_id"),
                prompt_tokens=pt,
                completion_tokens=ct,
            )
        except GroqError as exc:
            logger.error("copilot failed: %s", exc)
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Model": client.model,
            "X-Feature": "copilot",
        },
    )


@app.post("/api/ai/parse-resume")
async def parse_resume(
    http_request: Request,
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
):
    """Parses a resume (file upload or pasted text) into structured fields."""
    client = _require_ai()
    org_id = _org_id_from_request(http_request)
    raw_text = text or ""
    if file is not None:
        raw_text = await _extract_resume_text(file)
    raw_text = (raw_text or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="No resume content provided.")
    try:
        result = await client.parse_resume(ResumeParseRequest(text=raw_text))
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    cost = await _meter(
        "resume_parse", client.model, organization_id=org_id, prompt_tokens=pt, completion_tokens=ct
    )
    headers = _token_headers("resume_parse", client.model, pt, ct, cost)
    return JSONResponse(result.model_dump(), headers=headers)


@app.post("/api/ai/rank-candidates")
async def rank_candidates(
    http_request: Request,
    request: RankCandidatesRequest,
):
    """Ranks candidates against a job description."""
    client = _require_ai()
    org_id = _org_id_from_request(http_request)
    try:
        result = await client.rank_candidates(request)
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    cost = await _meter(
        "candidate_ranking", client.model, organization_id=org_id, prompt_tokens=pt, completion_tokens=ct
    )
    headers = _token_headers("candidate_ranking", client.model, pt, ct, cost)
    return JSONResponse(result.model_dump(), headers=headers)


@app.post("/api/ai/interview-report")
async def interview_report(
    http_request: Request,
    request: InterviewReportRequest,
):
    """Generates a structured post-interview report."""
    client = _require_ai()
    org_id = _org_id_from_request(http_request)
    try:
        result = await client.generate_interview_report(request)
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    cost = await _meter(
        "interview_report", client.model, organization_id=org_id, prompt_tokens=pt, completion_tokens=ct
    )
    headers = _token_headers("interview_report", client.model, pt, ct, cost)
    return JSONResponse(result.model_dump(), headers=headers)


@app.post("/api/ai/insights")
async def insights(
    http_request: Request,
    request: InsightsRequest,
):
    """Surfaces people-analytics insights and anomalies."""
    client = _require_ai()
    org_id = _org_id_from_request(http_request)
    try:
        result = await client.generate_insights(request)
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    cost = await _meter(
        "insights", client.model, organization_id=org_id, prompt_tokens=pt, completion_tokens=ct
    )
    headers = _token_headers("insights", client.model, pt, ct, cost)
    return JSONResponse(result.model_dump(), headers=headers)


@app.post("/api/ai/evaluate-pto")
async def evaluate_pto(
    http_request: Request,
    request: PtoEvaluationRequest,
):
    """Automated leave decision (non-streaming JSON)."""
    client = _require_ai()
    org_id = _org_id_from_request(http_request)
    try:
        result = await client.evaluate_pto(request)
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    cost = await _meter(
        "pto_evaluation", client.model, organization_id=org_id, prompt_tokens=pt, completion_tokens=ct
    )
    headers = _token_headers("pto_evaluation", client.model, pt, ct, cost)
    return JSONResponse(result.model_dump(), headers=headers)


@app.post("/api/workflows/trigger")
async def trigger_workflow(request: WorkflowTriggerRequest):
    """Triggers a workflow for a domain event and returns the execution result."""
    try:
        result = await workflow_engine.trigger(request)
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return JSONResponse(result.model_dump())


@app.post("/api/workflows/process-batch")
async def process_workflow_batch(http_request: Request):
    """
    Async batch processor for daily employee workflows — handles compute-heavy tasks:
    - Daily AI task digest summarization
    - Automated performance scoring
    - Anomaly detection

    Protected by BRIDGE_SECRET_KEY (via middleware) + tenant header X-Organization-Id.
    Org-isolated RLS enforced via Supabase client when configured.
    """
    # Organization isolation via header
    org_id = http_request.headers.get("x-organization-id")
    if not org_id:
        # Try to get from JSON body as fallback
        try:
            body = await http_request.json()
            org_id = body.get("organization_id") or body.get("organizationId")
        except Exception:
            org_id = None

    if not org_id:
        raise HTTPException(status_code=422, detail="X-Organization-Id header or organization_id in body is required.")

    try:
        # Parse body
        payload = await http_request.json()
    except Exception:
        payload = {}

    tasks = payload.get("tasks") or []
    if not isinstance(tasks, list):
        tasks = []

    # Limit batch size for high-throughput safety
    if len(tasks) > 500:
        raise HTTPException(status_code=422, detail="Batch too large (max 500 tasks).")

    options = payload.get("options") or {}

    if workflow_batch_processor is None:
        raise HTTPException(status_code=503, detail="Workflow batch processor not ready.")

    try:
        result = await workflow_batch_processor.process_batch(
            organization_id=str(org_id),
            tasks=tasks,
            options=options if isinstance(options, dict) else {},
        )

        # Meter the batch processing (best-effort)
        if usage_recorder is not None:
            # Estimate tokens for AI digests if any
            total_prompt = sum(d.get("prompt_tokens", 0) for d in result.get("digests", []))
            total_completion = sum(d.get("completion_tokens", 0) for d in result.get("digests", []))
            model = "openai/gpt-oss-120b"
            if result.get("digests"):
                first = result["digests"][0]
                model = first.get("model", model)
            await usage_recorder.record(
                feature="insights",
                model=model,
                organization_id=str(org_id),
                prompt_tokens=total_prompt,
                completion_tokens=total_completion,
            )

        # Build token echo headers for Next.js proxy
        total_prompt_tokens = sum(d.get("prompt_tokens", 0) for d in result.get("digests", []))
        total_completion_tokens = sum(d.get("completion_tokens", 0) for d in result.get("digests", []))
        cost = estimate_cost("openai/gpt-oss-120b", total_prompt_tokens, total_completion_tokens)

        headers = {
            "X-Prompt-Tokens": str(total_prompt_tokens),
            "X-Completion-Tokens": str(total_completion_tokens),
            "X-Model": "openai/gpt-oss-120b",
            "X-Feature": "workflow_batch",
            "X-Cost-Usd": f"{cost:.8f}",
            "X-Organization-Id": str(org_id),
        }

        return JSONResponse(
            {
                "ok": True,
                "organization_id": org_id,
                "processed": result.get("processed", 0),
                "failed": result.get("failed", 0),
                "total": result.get("total", 0),
                "digests": result.get("digests", []),
                "anomalies": result.get("anomalies", []),
            },
            headers=headers,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("workflow batch processing failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


async def _extract_resume_text(file: UploadFile) -> str:
    """Extracts text from an uploaded resume (PDF via pypdf, otherwise UTF-8)."""
    content = await file.read()
    filename = (file.filename or "").lower()
    if filename.endswith(".pdf"):
        try:
            from pypdf import PdfReader

            reader = PdfReader(__import__("io").BytesIO(content))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(pages).strip()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=400, detail=f"Could not read PDF: {exc}"
            ) from exc
    for encoding in ("utf-8", "latin-1"):
        try:
            return content.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    raise HTTPException(status_code=400, detail="Unsupported resume file encoding.")


@app.exception_handler(SupabaseError)
async def supabase_error_handler(_: Request, exc: SupabaseError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=settings.bridge_port, reload=True)
