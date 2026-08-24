"""Provider-agnostic AI client — the high-level business handlers.

This module owns the *what* (candidate screening, PTO decisions, resume
parsing, ranking, interview reports, insights, Copilot). The *how* (which
vendor, which endpoint) is delegated to a pluggable :class:`LLMProvider`, so
the same handlers work across OpenAI, Claude, Gemini, Groq, or any custom
OpenAI-compatible endpoint — the "bring any key" capability.

The handler protocols are unchanged from the Groq-only implementation:
streaming endpoints yield SSE-ready ``{"type": "delta"|"done", …}`` dicts.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

from .models import (
    CandidateEvaluation,
    CandidateEvaluationRequest,
    CopilotAction,
    CopilotRequest,
    CopilotResponse,
    InsightsRequest,
    InsightsResult,
    InterviewReportRequest,
    InterviewReportResult,
    PtoEvaluation,
    PtoEvaluationRequest,
    RankCandidatesRequest,
    RankCandidatesResult,
    ResumeParseRequest,
    ResumeParseResult,
    ToolCall,
)
from .parsing import extract_trailing_json, strip_json_block
from .providers.base import LLMProvider, ProviderError

logger = logging.getLogger("fluxentiq.bridge.ai")

# Backward-compatible alias: older code imported `GroqError` from groq_client.
GroqError = ProviderError


class AiClient:
    """Executes high-level AI tasks against a pluggable LLM provider."""

    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    @property
    def provider_name(self) -> str:
        return self._provider.name

    @property
    def model(self) -> str:
        return self._provider.model

    def last_usage(self) -> tuple[int, int]:
        """Returns ``(prompt_tokens, completion_tokens)`` from the last call."""
        return self._provider.last_usage()

    async def aclose(self) -> None:
        close = getattr(self._provider, "aclose", None)
        if close is not None:
            await close()

    # -- candidate match scoring ---------------------------------------------

    async def stream_candidate_evaluation(
        self,
        request: CandidateEvaluationRequest,
    ) -> AsyncIterator[dict[str, Any]]:
        user = (
            f"Candidate: {request.candidate_name}\n"
            f"Role: {request.role}\n"
            f"Stage: {request.stage}\n"
            f"Initial match score: {request.match_score}/100\n"
            + (f"Resume snippet: {request.resume_snippet}\n" if request.resume_snippet else "")
            + (f"Job description: {request.job_description}\n" if request.job_description else "")
            + (
                "\nWrite a 2–3 sentence screening summary, then append exactly one "
                'JSON line of the form:\n[[JSON]]{"score": <0-100>, '
                '"recommendation": "advance"|"hold"|"reject"}\n'
            )
        )

        buffer = ""
        async for delta in self._provider.stream_chat(
            [{"role": "system", "content": _CANDIDATE_SYSTEM}, {"role": "user", "content": user}]
        ):
            buffer += delta
            yield {"type": "delta", "content": delta}

        evaluation = self._parse_candidate_evaluation(request, buffer)
        yield {"type": "done", "result": evaluation.model_dump()}

    def _parse_candidate_evaluation(
        self, request: CandidateEvaluationRequest, text: str
    ) -> CandidateEvaluation:
        summary = strip_json_block(text).strip()
        structured = extract_trailing_json(text) or {}
        try:
            score = int(structured.get("score", request.match_score))
        except (TypeError, ValueError):
            score = request.match_score
        score = max(0, min(100, score))

        recommendation_raw = str(structured.get("recommendation", "hold")).lower()
        recommendation = (
            recommendation_raw
            if recommendation_raw in ("advance", "hold", "reject")
            else _heuristic_recommendation(score)
        )

        if not summary:
            summary = (
                f"AI screening completed for {request.candidate_name} "
                f"with a match score of {score}/100."
            )

        return CandidateEvaluation(
            candidate_id=request.candidate_id,
            candidate_name=request.candidate_name,
            score=score,
            summary=summary,
            recommendation=recommendation,  # type: ignore[arg-type]
        )

    # -- Copilot --------------------------------------------------------------

    async def stream_copilot(
        self, request: CopilotRequest
    ) -> AsyncIterator[dict[str, Any]]:
        messages: list[dict[str, str]] = [
            {"role": "system", "content": _COPILOT_SYSTEM}
        ]
        for message in request.messages:
            messages.append({"role": message.role, "content": message.content})

        context_block = ""
        if request.context:
            context_block = "\nContext:\n" + json.dumps(request.context, default=str) + "\n"
        if messages and messages[-1]["role"] == "user":
            messages[-1]["content"] = context_block + messages[-1]["content"]

        buffer = ""
        async for delta in self._provider.stream_chat(messages):
            buffer += delta
            yield {"type": "delta", "content": delta}

        text = strip_json_block(buffer).strip()
        actions_raw = extract_trailing_json(buffer) or {}
        actions_list = actions_raw.get("actions", []) if isinstance(actions_raw, dict) else []

        actions: list[CopilotAction] = []
        for index, item in enumerate(actions_list[:4]):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            kind = str(item.get("kind", "view")).strip()
            target = str(item.get("target", "/dashboard")).strip()
            if not title:
                continue
            if kind not in ("navigate", "approve", "view", "run"):
                kind = "view"
            actions.append(
                CopilotAction(id=f"action-{index + 1}", title=title, kind=kind, target=target)  # type: ignore[arg-type]
            )

        tool_calls: list[ToolCall] = []
        raw_tool_calls = actions_raw.get("tool_calls", []) if isinstance(actions_raw, dict) else []
        if isinstance(raw_tool_calls, list):
            for call in raw_tool_calls[:6]:
                if not isinstance(call, dict):
                    continue
                tool = str(call.get("tool", "")).strip()
                arguments = call.get("arguments") or {}
                if tool and isinstance(arguments, dict):
                    tool_calls.append(ToolCall(tool=tool, arguments=arguments))

        result = CopilotResponse(
            text=text or "I've processed your request.",
            actions=actions,
            tool_calls=tool_calls,
        )
        yield {"type": "done", "result": result.model_dump()}

    # -- resume parsing -------------------------------------------------------

    async def parse_resume(self, request: ResumeParseRequest) -> ResumeParseResult:
        user = f"Resume text:\n---\n{request.text[:6000]}\n---"
        result = await self._provider.complete_json(
            [
                {"role": "system", "content": _RESUME_SYSTEM},
                {"role": "user", "content": user},
            ]
        )
        skills = result.get("skills") or []
        if not isinstance(skills, list):
            skills = []
        education = result.get("education") or []
        if not isinstance(education, list):
            education = []

        experience_years = result.get("experience_years")
        try:
            experience_years = float(experience_years) if experience_years is not None else None
        except (TypeError, ValueError):
            experience_years = None

        return ResumeParseResult(
            full_name=_optional_str(result.get("full_name")),
            email=_optional_str(result.get("email")),
            phone=_optional_str(result.get("phone")),
            current_role=_optional_str(result.get("current_role")),
            experience_years=experience_years,
            skills=[str(skill) for skill in skills][:20],
            education=[str(item) for item in education][:6],
            summary=_optional_str(result.get("summary")),
        )

    # -- candidate ranking ----------------------------------------------------

    async def rank_candidates(
        self, request: RankCandidatesRequest
    ) -> RankCandidatesResult:
        candidates_block = "\n".join(
            f"- [{candidate.candidate_id}] {candidate.candidate_name} "
            f"(role: {candidate.role}, current score: {candidate.current_score})"
            + (f"\n  resume: {candidate.resume_snippet}" if candidate.resume_snippet else "")
            for candidate in request.candidates
        )
        user = (
            f"Job description:\n---\n{request.job_description[:4000]}\n---\n"
            f"Candidates:\n{candidates_block}"
        )
        result = await self._provider.complete_json(
            [
                {"role": "system", "content": _RANK_SYSTEM},
                {"role": "user", "content": user},
            ]
        )
        rankings_raw = result.get("rankings") or []
        if not isinstance(rankings_raw, list):
            rankings_raw = []

        rankings = []
        for index, item in enumerate(rankings_raw[:50]):
            if not isinstance(item, dict):
                continue
            score = _clamp_score(item.get("score"))
            recommendation_raw = str(item.get("recommendation", "hold")).lower()
            recommendation = (
                recommendation_raw
                if recommendation_raw in ("advance", "hold", "reject")
                else _heuristic_recommendation(score)
            )
            rankings.append(
                {
                    "candidate_id": str(item.get("candidate_id", f"rank-{index}")),
                    "candidate_name": str(item.get("candidate_name", "Unknown")),
                    "score": score,
                    "reasoning": str(item.get("reasoning", "")).strip(),
                    "recommendation": recommendation,
                }
            )
        return RankCandidatesResult(rankings=rankings)

    # -- interview report -----------------------------------------------------

    async def generate_interview_report(
        self, request: InterviewReportRequest
    ) -> InterviewReportResult:
        user = (
            f"Candidate: {request.candidate_name}\n"
            f"Role: {request.role}\n"
            f"Stage: {request.stage}\n"
            f"Prior score: {request.prior_score}/100\n"
            f"Interview notes:\n---\n{request.interview_notes[:6000]}\n---"
        )
        result = await self._provider.complete_json(
            [
                {"role": "system", "content": _INTERVIEW_SYSTEM},
                {"role": "user", "content": user},
            ]
        )
        strengths = _string_list(result.get("strengths"))
        weaknesses = _string_list(result.get("weaknesses"))
        next_steps = _string_list(result.get("next_steps"))
        score = _clamp_score(result.get("score"), fallback=request.prior_score)
        recommendation_raw = str(result.get("recommendation", "hold")).lower()
        recommendation = (
            recommendation_raw
            if recommendation_raw in ("advance", "hold", "reject")
            else _heuristic_recommendation(score)
        )
        return InterviewReportResult(
            summary=str(result.get("summary", "")).strip() or "Interview completed.",
            strengths=strengths,
            weaknesses=weaknesses,
            score=score,
            recommendation=recommendation,  # type: ignore[arg-type]
            next_steps=next_steps,
        )

    # -- analytics insights ---------------------------------------------------

    async def generate_insights(self, request: InsightsRequest) -> InsightsResult:
        user = "Analytics metrics:\n" + json.dumps(request.metrics, default=str)
        result = await self._provider.complete_json(
            [
                {"role": "system", "content": _INSIGHTS_SYSTEM},
                {"role": "user", "content": user},
            ]
        )
        insights_raw = result.get("insights") or result.get("key_insights") or []
        if not isinstance(insights_raw, list):
            insights_raw = []

        insights = []
        for item in insights_raw[:8]:
            if not isinstance(item, dict):
                continue
            severity = str(item.get("severity", "info")).lower()
            if severity not in ("info", "positive", "warning", "critical"):
                severity = "info"
            insights.append(
                {
                    "title": str(item.get("title", "")).strip() or "Insight",
                    "description": str(item.get("description", "")).strip(),
                    "severity": severity,
                    "metric": str(item.get("metric", "general")),
                }
            )
        return InsightsResult(insights=insights)

    # -- automated PTO evaluation ---------------------------------------------

    async def evaluate_pto(self, request: PtoEvaluationRequest) -> PtoEvaluation:
        user = (
            f"Employee: {request.employee_name}\n"
            f"Leave type: {request.leave_type}\n"
            f"Window: {request.start_date} to {request.end_date}\n"
            f"Reason: {request.reason or '(none provided)'}\n"
            f"Remaining balance (days): {request.balance_days}\n"
            f"Overlapping team absences: {request.team_absences}\n"
        )
        result = await self._provider.complete_json(
            [
                {"role": "system", "content": _PTO_SYSTEM},
                {"role": "user", "content": user},
            ]
        )
        decision_raw = str(result.get("decision", "escalate")).lower()
        decision = (
            decision_raw if decision_raw in ("approve", "reject", "escalate") else "escalate"
        )
        try:
            confidence = float(result.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5
        confidence = max(0.0, min(1.0, confidence))
        return PtoEvaluation(
            employee_id=request.employee_id,
            decision=decision,  # type: ignore[arg-type]
            confidence=confidence,
            reasoning=str(result.get("reasoning", "")).strip()
            or "No reasoning provided by the model.",
        )


# -- prompt templates ---------------------------------------------------------

_CANDIDATE_SYSTEM = (
    "You are Fluxentiq's AI recruiting assistant. You screen candidates for an "
    "HR platform. Be concise, evidence-based, and never invent facts about the "
    "candidate beyond what is provided."
)

_COPILOT_SYSTEM = (
    "You are the Fluxentiq AI Copilot, an assistant for an HR management "
    "platform covering employees, recruitment, leave, payroll and workflows. "
    "Answer in 1–3 sentences. When the user's request implies a navigation or "
    "viewing action, append exactly one JSON line of the form:\n"
    '[[JSON]]{"actions": [{"title": "...", "kind": "navigate"|"approve"|"view"|"run", '
    '"target": "/..."}]}\n'
    "with at most 4 actions. target must be one of /dashboard, /employees, "
    "/recruitment, /leave, /payroll, /analytics, /workflows/builder.\n\n"
    "When the user asks you to actually PERFORM an action (approve or reject a "
    "leave request, advance a candidate to the next stage), include a "
    '"tool_calls" array in the SAME JSON line using one of these tools:\n'
    '[[JSON]]{"tool_calls": [{"tool": "approve_leave"|"reject_leave"|"advance_candidate", '
    '"arguments": {"employee_name"|"candidate_name": "..."}}]}\n'
    "Use the exact person name the user mentioned. Do not call tools unless the "
    "user explicitly asked you to perform that action."
)

_PTO_SYSTEM = (
    "You are Fluxentiq's leave-policy engine. Given a leave request, decide "
    'whether to "approve", "reject", or "escalate" (to a human manager). '
    "Consider remaining balance, overlap with other absences, and reason "
    "quality. Respond with JSON only, with keys: decision, confidence (0.0-1.0), "
    "and reasoning (one sentence)."
)

_RESUME_SYSTEM = (
    "You are Fluxentiq's resume parser. Extract structured data from the "
    "provided resume text. Respond with JSON only, with keys: full_name, email, "
    "phone, current_role, experience_years (number), skills (array of strings), "
    "education (array of strings), summary (one sentence). Omit unknown fields "
    "with null. Never fabricate data."
)

_RANK_SYSTEM = (
    "You are Fluxentiq's candidate-ranking engine. Rank each candidate against "
    "the provided job description. Respond with JSON only, with key rankings: "
    "an array of objects with candidate_id, candidate_name, score (0-100), "
    "reasoning (one sentence), recommendation (advance|hold|reject). Order by "
    "score descending. Be fair and evidence-based."
)

_INTERVIEW_SYSTEM = (
    "You are Fluxentiq's interview-report writer. Given interview notes, produce "
    "a structured post-interview report. Respond with JSON only, with keys: "
    "summary (2-3 sentences), strengths (array), weaknesses (array), score "
    "(0-100), recommendation (advance|hold|reject), next_steps (array). Be "
    "balanced and specific."
)

_INSIGHTS_SYSTEM = (
    "You are Fluxentiq's people-analytics AI. Given HR analytics metrics, surface "
    "anomalies, risks, and opportunities. Respond with JSON only, with key "
    '"insights": an array of objects with title, description, severity '
    "(info|positive|warning|critical), metric. At most 6 insights, prioritized "
    "by impact. The JSON key must be exactly \"insights\"."
)


# -- shared helpers -----------------------------------------------------------

def _heuristic_recommendation(score: int) -> str:
    if score >= 85:
        return "advance"
    if score >= 75:
        return "hold"
    return "reject"


def _clamp_score(value: Any, fallback: int = 0) -> int:
    try:
        score = int(value)
    except (TypeError, ValueError):
        score = fallback
    return max(0, min(100, score))


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()][:10]
