from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class PerformanceEvidenceSummary:
    completed_goals: int
    at_risk_goals: int
    average_goal_progress: float | None
    feedback_count: int
    summary: str
    limitations: str


def summarize_performance_evidence(goals: Iterable[dict[str, Any]], feedback: Iterable[dict[str, Any]]) -> PerformanceEvidenceSummary:
    goal_rows = [goal for goal in goals if isinstance(goal, dict)]
    feedback_rows = [note for note in feedback if isinstance(note, dict)]
    progress_values = [float(goal["progress_percent"]) for goal in goal_rows if isinstance(goal.get("progress_percent"), (int, float))]
    completed = sum(1 for goal in goal_rows if str(goal.get("status", "")).lower() == "completed")
    at_risk = sum(1 for goal in goal_rows if str(goal.get("status", "")).lower() == "at_risk")
    average = round(sum(progress_values) / len(progress_values), 2) if progress_values else None
    progress_text = f"Average recorded goal progress is {average:.2f}%" if average is not None else "No recorded goal progress is available"
    summary = f"{progress_text}; {completed} goal(s) are completed and {at_risk} goal(s) are marked at risk. {len(feedback_rows)} feedback item(s) are available for human review."
    return PerformanceEvidenceSummary(
        completed_goals=completed,
        at_risk_goals=at_risk,
        average_goal_progress=average,
        feedback_count=len(feedback_rows),
        summary=summary,
        limitations="This summary reports stored work evidence only. It does not rank people, predict retention, or make employment decisions."
    )
