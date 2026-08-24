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
from bridge.supabase_client import SupabaseClient, SupabaseError
from bridge.tools import make_executor
from bridge.usage import make_recorder
from bridge.workflow_engine import make_engine
from bridge.engine_routes import router as engine_router
from bridge.jobs import default_registry
from bridge.logging import setup_json_logging
from bridge.rate_limit import SlidingWindowRateLimiter
from bridge.security import is_public_path, verify_bridge_secret

# Structured JSON logging across every bridge module.
setup_json_logging()

import logging

logger = logging.getLogger("fluxentiq.bridge")

ai: AiClient | None = None
supabase: SupabaseClient | None = None
workflow_engine = None
tool_executor = None
usage_recorder = None
jobs = default_registry
rate_limiter: SlidingWindowRateLimiter | None = None
_started_at = time.time()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global ai, supabase, workflow_engine, tool_executor, usage_recorder, rate_limiter

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


async def _meter(
    feature: str,
    model: str,
    organization_id: str | None = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> None:
    """Records AI usage (tokens + cost) after a successful call (best-effort)."""
    if usage_recorder is not None:
        await usage_recorder.record(
            feature=feature,
            model=model,
            organization_id=organization_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )


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
async def test_ai():
    """Verifies the configured AI provider with a minimal completion."""
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
        return {
            "ok": True,
            "provider": settings.llm_provider,
            "model": client.model,
            "message": f"Connected to {settings.llm_provider} ({client.model}).",
        }
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=502,
            content={"ok": False, "message": str(exc)},
        )


@app.post("/api/ai/evaluate-candidate")
async def evaluate_candidate(request: CandidateEvaluationRequest):
    """Streams a Groq candidate screening (deltas → structured evaluation)."""
    client = _require_ai()

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in client.stream_candidate_evaluation(request):
                yield _sse(event)
            yield _sse("[DONE]")
            pt, ct = client.last_usage()
            await _meter(
                "candidate_evaluation", client.model,
                prompt_tokens=pt, completion_tokens=ct,
            )
        except GroqError as exc:
            logger.error("candidate evaluation failed: %s", exc)
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/ai/copilot")
async def copilot(request: CopilotRequest):
    """Streams a Copilot reply (deltas → text + action cards + tool execution)."""
    client = _require_ai()

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in client.stream_copilot(request):
                yield _sse(event)
                if event.get("type") == "done":
                    # Execute any tool calls and emit their results.
                    result = event.get("result") or {}
                    organization_id = request.context.get("organization_id")
                    for call in result.get("tool_calls", []):
                        from bridge.models import ToolCall

                        tool_result = await tool_executor.execute(
                            ToolCall(**call), organization_id
                        )
                        yield _sse({"type": "tool_result", "result": tool_result.model_dump()})
            yield _sse("[DONE]")
            pt, ct = client.last_usage()
            await _meter(
                "copilot", client.model,
                organization_id=request.context.get("organization_id"),
                prompt_tokens=pt, completion_tokens=ct,
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
        },
    )


@app.post("/api/ai/parse-resume")
async def parse_resume(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
):
    """Parses a resume (file upload or pasted text) into structured fields."""
    client = _require_ai()
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
    await _meter("resume_parse", client.model, prompt_tokens=pt, completion_tokens=ct)
    return JSONResponse(result.model_dump())


@app.post("/api/ai/rank-candidates")
async def rank_candidates(request: RankCandidatesRequest):
    """Ranks candidates against a job description."""
    client = _require_ai()
    try:
        result = await client.rank_candidates(request)
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    await _meter("candidate_ranking", client.model, prompt_tokens=pt, completion_tokens=ct)
    return JSONResponse(result.model_dump())


@app.post("/api/ai/interview-report")
async def interview_report(request: InterviewReportRequest):
    """Generates a structured post-interview report."""
    client = _require_ai()
    try:
        result = await client.generate_interview_report(request)
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    await _meter("interview_report", client.model, prompt_tokens=pt, completion_tokens=ct)
    return JSONResponse(result.model_dump())


@app.post("/api/ai/insights")
async def insights(request: InsightsRequest):
    """Surfaces people-analytics insights and anomalies."""
    client = _require_ai()
    try:
        result = await client.generate_insights(request)
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    await _meter("insights", client.model, prompt_tokens=pt, completion_tokens=ct)
    return JSONResponse(result.model_dump())


@app.post("/api/ai/evaluate-pto")
async def evaluate_pto(request: PtoEvaluationRequest):
    """Automated leave decision (non-streaming JSON)."""
    client = _require_ai()
    try:
        result = await client.evaluate_pto(request)
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    pt, ct = client.last_usage()
    await _meter("pto_evaluation", client.model, prompt_tokens=pt, completion_tokens=ct)
    return JSONResponse(result.model_dump())


@app.post("/api/workflows/trigger")
async def trigger_workflow(request: WorkflowTriggerRequest):
    """Triggers a workflow for a domain event and returns the execution result."""
    try:
        result = await workflow_engine.trigger(request)
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return JSONResponse(result.model_dump())


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
