"""Fluxentiq ML engine endpoints.

Exposes the deterministic `python_engine/` modules over FastAPI so the Next.js
app (via its `/api/ai/*` proxy) and the BYOK bridge can call them with the same
rate-limiting + metering pipeline as the LLM handlers.

Endpoints are grouped by domain; each accepts a JSON payload (or a file upload
for OCR/resume) and returns a typed result. Errors are returned as structured
``{"detail": ...}`` payloads.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from bridge.jobs import default_registry, dispatch

logger = logging.getLogger("fluxentiq.bridge.engine")

router = APIRouter(prefix="/api/engine", tags=["engine"])


def _ok(payload: Any) -> JSONResponse:
    return JSONResponse(payload)


def _accepted(job_id: str, kind: str) -> JSONResponse:
    """202 Accepted body returned for background-dispatched work."""
    return JSONResponse(
        status_code=202,
        content={"accepted": True, "job_id": job_id, "kind": kind},
    )


def _require(payload: dict[str, Any], *keys: str) -> None:
    for key in keys:
        if key not in payload:
            raise HTTPException(status_code=422, detail=f"Missing field: {key}")


# ── Recruitment ──────────────────────────────────────────────────────────────
@router.post("/resume/parse")
async def resume_parse(file: UploadFile = File(...)):
    """Parses a resume file (pdf/docx/text) into structured fields."""
    try:
        import tempfile

        from python_engine.resume_parser_v2 import parse_resume_v2

        suffix = os.path.splitext(file.filename or "")[1] or ".txt"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name
        try:
            result = parse_resume_v2(tmp_path)
            return _ok({"ok": True, "resume": result.__dict__ if hasattr(result, "__dict__") else result})
        finally:
            os.unlink(tmp_path)
    except Exception as exc:  # noqa: BLE001
        logger.exception("resume parse failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/candidates/semantic-search")
async def semantic_search(payload: dict[str, Any]):
    """Ranks candidates by semantic similarity to a query."""
    try:
        from python_engine.candidate_semantic_search import semantic_search
        from python_engine.vector_store import InMemoryVectorStore, VectorRecord

        query = str(payload.get("query", ""))
        candidates = payload.get("candidates") or []
        if not query:
            raise HTTPException(status_code=422, detail="query is required.")

        store = InMemoryVectorStore()
        for index, candidate in enumerate(candidates):
            if not isinstance(candidate, dict):
                continue
            name = candidate.get("name") or candidate.get("full_name") or f"candidate-{index}"
            text = candidate.get("text") or candidate.get("summary") or name
            record = VectorRecord(
                id=candidate.get("id", f"c-{index}"),
                vector=[0.0],
                metadata={**candidate, "name": name, "text": text},
            )
            store.upsert(record)
        results = semantic_search(store, query, limit=int(payload.get("limit", 10)))
        return _ok({"ok": True, "results": [r.__dict__ for r in results]})
    except Exception as exc:  # noqa: BLE001
        logger.exception("semantic search failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/embeddings/generate")
async def embeddings_generate(payload: dict[str, Any]):
    """Generates a deterministic embedding vector for a text (BYOK-agnostic)."""
    try:
        from python_engine.embeddings_generator import generate_embedding

        text = str(payload.get("text", ""))
        dims = int(payload.get("dimensions", 1536))
        vector = generate_embedding(text, dims)
        return _ok({"ok": True, "dimensions": dims, "vector": vector})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Attendance & anomalies ───────────────────────────────────────────────────
@router.post("/attendance/anomalies")
async def attendance_anomalies(payload: dict[str, Any]):
    try:
        from python_engine.anomaly_detector import detect_attendance_anomalies

        records = payload.get("records") or []
        anomalies = detect_attendance_anomalies(records if isinstance(records, list) else [])
        return _ok({"ok": True, "anomalies": [a.__dict__ for a in anomalies]})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Payroll ──────────────────────────────────────────────────────────────────
@router.post("/tax/estimate")
async def tax_estimate(payload: dict[str, Any]):
    _require(payload, "jurisdiction", "gross")
    try:
        from python_engine.tax_calculator_us_pk_uk import estimate_withholding

        result = estimate_withholding(str(payload["jurisdiction"]), float(payload["gross"]))
        return _ok({"ok": True, "tax": result.__dict__})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/payroll/reconcile")
async def payroll_reconcile(payload: dict[str, Any]):
    try:
        from python_engine.payroll_reconciler import reconcile_entries

        entries = payload.get("entries") or []
        issues = reconcile_entries(entries if isinstance(entries, list) else [])
        return _ok({"ok": True, "issues": issues})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/payroll/payslip-pdf")
async def payslip_pdf(payload: dict[str, Any]):
    try:
        import tempfile

        from python_engine.pdf_payslip_builder import build_payslip_pdf

        tmp_path = tempfile.mktemp(suffix=".pdf")
        build_payslip_pdf(tmp_path, **{k: v for k, v in payload.items() if k != "employee"})
        with open(tmp_path, "rb") as handle:
            content = handle.read()
        os.unlink(tmp_path)
        return Response(content=content, media_type="application/pdf")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Expenses / OCR ───────────────────────────────────────────────────────────
@router.post("/ocr/parse")
async def ocr_parse(file: UploadFile = File(...)):
    try:
        import tempfile

        from python_engine.document_ocr import extract_document_text

        suffix = os.path.splitext(file.filename or "")[1] or ".txt"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name
        try:
            result = extract_document_text(tmp_path)
            return _ok({"ok": True, "text": result.text, "pages": result.pages})
        finally:
            os.unlink(tmp_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/expenses/flag")
async def expense_flags(payload: dict[str, Any]):
    try:
        from python_engine.expense_fraud_detector import flag_expenses

        expenses = payload.get("expenses") or []
        flagged = flag_expenses(expenses if isinstance(expenses, list) else [])
        return _ok({"ok": True, "flagged": flagged})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/expenses/receipt-scan")
async def receipt_scan(payload: dict[str, Any]):
    try:
        from python_engine.receipt_ocr_scanner import scan_receipt

        text = str(payload.get("text", ""))
        return _ok({"ok": True, "receipt": scan_receipt(text)})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Forecasting & analytics ──────────────────────────────────────────────────
@router.post("/forecast")
async def forecast(payload: dict[str, Any]):
    _require(payload, "values")
    try:
        from python_engine.forecast_prophet_model import linear_forecast

        values = [float(v) for v in payload["values"]]
        periods = int(payload.get("periods", 6))
        return _ok({"ok": True, "forecast": linear_forecast(values, periods)})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/sentiment")
async def sentiment(payload: dict[str, Any]):
    try:
        from python_engine.sentiment_analyzer import analyze_sentiment

        texts = payload.get("texts") or []
        result = analyze_sentiment(texts if isinstance(texts, list) else [])
        return _ok({"ok": True, "sentiment": result.__dict__})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/text/topics")
async def topics(payload: dict[str, Any]):
    try:
        from python_engine.topic_modeler import topics

        texts = payload.get("texts") or []
        result = topics(texts if isinstance(texts, list) else [], int(payload.get("limit", 10)))
        return _ok({"ok": True, "topics": result})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Learning / performance ───────────────────────────────────────────────────
@router.post("/quiz/generate")
async def quiz_generate(payload: dict[str, Any]):
    try:
        from python_engine.quiz_generator import build_review_questions

        objectives = payload.get("objectives") or []
        questions = build_review_questions(objectives if isinstance(objectives, list) else [])
        return _ok({"ok": True, "questions": [q.__dict__ for q in questions]})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/performance/summarize")
async def performance_summarize(payload: dict[str, Any]):
    try:
        from python_engine.performance_summarizer import summarize_performance_evidence

        goals = payload.get("goals") or []
        feedback = payload.get("feedback") or []
        result = summarize_performance_evidence(
            goals if isinstance(goals, list) else [],
            feedback if isinstance(feedback, list) else [],
        )
        return _ok({"ok": True, "summary": result.__dict__})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/learning/certificate-pdf")
async def certificate_pdf(payload: dict[str, Any]):
    try:
        import tempfile

        from python_engine.cert_pdf_generator import generate_certificate_pdf

        tmp_path = tempfile.mktemp(suffix=".pdf")
        generate_certificate_pdf(
            tmp_path,
            recipient_name=str(payload.get("recipient_name", "")),
            course_title=str(payload.get("course_title", "")),
            issuer=str(payload.get("issuer", "Fluxentiq Learning")),
        )
        with open(tmp_path, "rb") as handle:
            content = handle.read()
        os.unlink(tmp_path)
        return Response(content=content, media_type="application/pdf")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Compensation / career / skills ───────────────────────────────────────────
@router.post("/compensation/benchmark")
async def comp_benchmark(payload: dict[str, Any]):
    _require(payload, "internal")
    try:
        from python_engine.market_comp_analyzer import benchmark

        result = benchmark(float(payload["internal"]), float(payload.get("market_midpoint", 0)))
        return _ok({"ok": True, "benchmark": result})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/career/pathways")
async def career_pathways(payload: dict[str, Any]):
    try:
        from python_engine.career_path_generator import pathways

        result = pathways(str(payload.get("role", "")), payload.get("skills") or [])
        return _ok({"ok": True, "pathways": result})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/skills/map")
async def skills_map(payload: dict[str, Any]):
    try:
        from python_engine.skill_ontology_mapper import map_skills

        skills = payload.get("skills") or []
        return _ok({"ok": True, "mapping": map_skills(skills if isinstance(skills, list) else [])})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Contractors / workflows / scraping ───────────────────────────────────────
@router.post("/contractors/compliance")
async def contractor_compliance(payload: dict[str, Any]):
    try:
        from python_engine.compliance_checker import check_invoice

        invoice = payload.get("invoice") or {}
        return _ok({"ok": True, "issues": check_invoice(invoice if isinstance(invoice, dict) else {})})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/workflows/run")
async def workflow_run(payload: dict[str, Any]):
    try:
        from python_engine.workflow_runner import run_graph

        graph = payload.get("graph") or {}
        context = payload.get("context") or {}
        return _ok({"ok": True, "execution": run_graph(graph, context)})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/fx/rate")
async def fx_rate(payload: dict[str, Any]):
    """Fetches an FX rate in the background (blocking network I/O)."""
    _require(payload, "base", "quote")
    base = str(payload["base"])
    quote = str(payload["quote"])
    endpoint = str(payload.get("endpoint", ""))

    from python_engine.fx_rate_fetcher import fetch_rate

    async def _work() -> dict[str, Any]:
        rate = await asyncio.to_thread(fetch_rate, base, quote, endpoint)
        return {"rate": rate}

    job = await dispatch(default_registry, "fx_rate", _work)
    return _accepted(job.id, "fx_rate")


@router.post("/scrape/url")
async def scrape_url(payload: dict[str, Any]):
    """Scrapes a URL in the background (blocking network + HTML parse)."""
    _require(payload, "url")

    from python_engine.scraper import scrape_url as _scrape_url

    target = str(payload["url"])

    async def _work() -> dict[str, Any]:
        result = await asyncio.to_thread(_scrape_url, target)
        return {"title": result.title, "text": result.text, "host": result.host}

    job = await dispatch(default_registry, "scrape_url", _work)
    return _accepted(job.id, "scrape_url")


@router.post("/scrape/linkedin")
async def scrape_linkedin(payload: dict[str, Any]):
    """Scrapes a public LinkedIn profile in the background."""
    _require(payload, "url")

    from python_engine.linkedin_scraper import scrape_public_profile

    target = str(payload["url"])

    async def _work() -> Any:
        return await asyncio.to_thread(scrape_public_profile, target)

    job = await dispatch(default_registry, "scrape_linkedin", _work)
    return _accepted(job.id, "scrape_linkedin")


@router.get("/health")
async def engine_health() -> dict[str, Any]:
    """Reports which engine modules are importable."""
    modules = [
        "resume_parser_v2", "candidate_semantic_search", "embeddings_generator",
        "anomaly_detector", "tax_calculator_us_pk_uk", "invoice_ocr_parser",
        "receipt_ocr_scanner", "document_ocr", "expense_fraud_detector",
        "forecast_prophet_model", "sentiment_analyzer", "survey_nlp_analyzer",
        "quiz_generator", "market_comp_analyzer", "payroll_reconciler",
        "pdf_payslip_builder", "cert_pdf_generator", "performance_summarizer",
        "compliance_checker", "skill_ontology_mapper", "topic_modeler",
        "workflow_runner", "career_path_generator", "fx_rate_fetcher",
        "linkedin_scraper", "scraper", "vector_store",
    ]
    status = {}
    for name in modules:
        try:
            __import__(f"python_engine.{name}")
            status[name] = "ok"
        except Exception as exc:  # noqa: BLE001
            status[name] = f"error: {exc}"
    return {"ok": True, "modules": status}
