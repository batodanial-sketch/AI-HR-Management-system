"""Request/response models for the AI bridge endpoints.

These mirror the contracts consumed by the Next.js frontend and the Playwright
E2E suite (see `e2e/utils/ai-mocks.ts` for the client-side shapes).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

RecruitmentStage = Literal["applied", "screening", "interview", "offer", "hired"]
LeaveType = Literal["pto", "sick", "unpaid"]
Recommendation = Literal["advance", "hold", "reject"]


class AiTestRequest(BaseModel):
    """Optional overrides for the ``/api/ai/test`` diagnostic endpoint.

    Lets the Next.js test-connection route validate alternative Groq models
    and custom OpenAI-compatible endpoints without mutating stored settings.
    API keys are NEVER accepted here — the bridge resolves them from its own
    configuration.
    """

    provider: str | None = None
    model: str | None = None
    base_url: str | None = Field(default=None, alias="baseUrl")


class CandidateEvaluationRequest(BaseModel):
    candidate_id: str
    candidate_name: str
    role: str
    match_score: int = Field(ge=0, le=100)
    stage: RecruitmentStage = "applied"
    resume_snippet: str | None = None
    job_description: str | None = None


class CandidateEvaluation(BaseModel):
    candidate_id: str
    candidate_name: str
    score: int = Field(ge=0, le=100)
    summary: str
    recommendation: Recommendation


class PtoEvaluationRequest(BaseModel):
    employee_id: str
    employee_name: str
    leave_type: LeaveType
    start_date: str
    end_date: str
    reason: str
    balance_days: int = Field(ge=0)
    team_absences: int = Field(ge=0, description="Overlapping team absences in the window.")


class PtoEvaluation(BaseModel):
    employee_id: str
    decision: Literal["approve", "reject", "escalate"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str


class CopilotMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class CopilotAction(BaseModel):
    id: str
    title: str
    kind: Literal["navigate", "approve", "view", "run"]
    target: str


class CopilotRequest(BaseModel):
    messages: list[CopilotMessage]
    context: dict[str, Any] = Field(default_factory=dict)


class WorkflowNode(BaseModel):
    id: str
    type: Literal["trigger", "action", "condition", "delay"]
    label: str
    config: dict[str, Any] = Field(default_factory=dict)


class WorkflowTriggerRequest(BaseModel):
    event: str
    payload: dict[str, Any] = Field(default_factory=dict)
    # Optional inline workflow (nodes in execution order). When omitted, the
    # engine looks up persisted definitions in Supabase.
    workflow: list[WorkflowNode] | None = None
    run_id: str | None = None


class WorkflowExecution(BaseModel):
    run_id: str
    event: str
    status: Literal["completed", "failed", "no_workflow"]
    executed_actions: list[str] = Field(default_factory=list)
    error: str | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — AI moat: resume parsing, candidate ranking, interview reports,
# analytics insights, and Copilot tool-calling.
# ─────────────────────────────────────────────────────────────────────────────

class ResumeParseRequest(BaseModel):
    text: str = Field(min_length=1, description="Raw resume text to parse.")


class ResumeParseResult(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    current_role: str | None = None
    experience_years: float | None = None
    skills: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    summary: str | None = None


class RankCandidate(BaseModel):
    candidate_id: str
    candidate_name: str
    role: str
    resume_snippet: str | None = None
    current_score: int = Field(default=0, ge=0, le=100)


class RankCandidatesRequest(BaseModel):
    job_description: str = Field(min_length=1)
    candidates: list[RankCandidate]


class RankedCandidate(BaseModel):
    candidate_id: str
    candidate_name: str
    score: int = Field(ge=0, le=100)
    reasoning: str
    recommendation: Recommendation


class RankCandidatesResult(BaseModel):
    rankings: list[RankedCandidate]


class InterviewReportRequest(BaseModel):
    candidate_name: str
    role: str
    stage: RecruitmentStage
    interview_notes: str = Field(min_length=1)
    prior_score: int = Field(default=0, ge=0, le=100)


class InterviewReportResult(BaseModel):
    summary: str
    strengths: list[str]
    weaknesses: list[str]
    score: int = Field(ge=0, le=100)
    recommendation: Recommendation
    next_steps: list[str]


class InsightsRequest(BaseModel):
    metrics: dict[str, Any] = Field(
        description="Analytics payload: headcount, attrition, payroll, time_to_hire, leave."
    )


class Insight(BaseModel):
    title: str
    description: str
    severity: Literal["info", "positive", "warning", "critical"]
    metric: str


class InsightsResult(BaseModel):
    insights: list[Insight]


class ToolCall(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    tool: str
    ok: bool
    message: str


class CopilotResponse(BaseModel):
    text: str
    actions: list[CopilotAction] = Field(default_factory=list)
    tool_calls: list[ToolCall] = Field(default_factory=list)
