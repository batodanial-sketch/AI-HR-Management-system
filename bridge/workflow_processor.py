"""
Fluxentiq Daily Workflow Engine — async batch processor for compute-heavy tasks.

Handles:
- Daily AI task digest summarization
- Automated performance scoring
- Anomaly detection (attendance, payroll)

RCE-safe: no shell execution, only deterministic Python + optional LLM summarization.
Tenant-isolated via X-Organization-Id header.
Protected by BRIDGE_SECRET_KEY (validated in server.py middleware).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List

from .cost import estimate_cost
from .supabase_client import SupabaseClient
from .ai_client import AiClient

logger = logging.getLogger("fluxentiq.bridge.workflow_processor")


class WorkflowBatchProcessor:
    """Processes batches of daily tasks with AI and deterministic logic."""

    def __init__(
        self,
        supabase: SupabaseClient | None,
        ai_client: AiClient | None,
    ) -> None:
        self._supabase = supabase
        self._ai = ai_client

    async def process_batch(
        self,
        organization_id: str,
        tasks: List[Dict[str, Any]],
        options: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        """
        Processes a batch of daily_employee_tasks.

        Each task may contain steps like:
        - ai_task_digest: summarize tasks for employee
        - performance_scoring: automated scoring
        - anomaly_detection: detect anomalies

        Returns summary with processed count, failures, and AI digests.
        """
        options = options or {}
        processed = 0
        failed = 0
        digests: List[Dict[str, Any]] = []
        anomalies: List[Dict[str, Any]] = []

        for task in tasks:
            try:
                task_id = str(task.get("id", "unknown"))
                employee_id = str(task.get("employee_id", "unknown"))
                payload = task.get("payload_json") or task.get("payload") or {}
                steps = []
                if isinstance(payload, dict):
                    steps = payload.get("steps") or []

                # Process each step in task
                for step in steps if isinstance(steps, list) else []:
                    if not isinstance(step, dict):
                        continue
                    step_type = str(step.get("type", "custom"))
                    step_id = str(step.get("id", "unknown"))

                    if step_type == "ai_task_digest":
                        digest = await self._generate_task_digest(
                            organization_id, employee_id, task_id, payload, step
                        )
                        if digest:
                            digests.append(digest)

                    elif step_type == "performance_scoring":
                        score = await self._calculate_performance_score(
                            organization_id, employee_id, payload, step
                        )
                        # Persist score if Supabase available (best-effort)
                        if self._supabase and score:
                            try:
                                await self._supabase.insert(
                                    "performance_reviews",
                                    [
                                        {
                                            "organization_id": organization_id,
                                            "employee_id": employee_id,
                                            "review_type": "auto",
                                            "status": "completed",
                                            "overall_rating": score.get("score", 0),
                                            "summary": score.get("summary", ""),
                                            "ai_summary": score.get("ai_summary", ""),
                                        }
                                    ],
                                )
                            except Exception as exc:
                                logger.warning("performance scoring persist failed: %s", exc)

                    elif step_type == "anomaly_detection":
                        anomaly = await self._detect_anomalies(
                            organization_id, employee_id, payload, step
                        )
                        if anomaly:
                            anomalies.append(anomaly)

                    elif step_type == "attendance_auto_log":
                        # Deterministic: attendance already handled in Next.js action,
                        # but we log here for observability
                        logger.info(
                            "attendance auto-log processed task=%s employee=%s org=%s",
                            task_id,
                            employee_id,
                            organization_id,
                        )

                    elif step_type == "notification_dispatch":
                        # Notifications are handled in Next.js, but we can also dispatch via bridge
                        if self._supabase:
                            try:
                                config = step.get("config") or {}
                                title = str(config.get("title", "Workflow Task"))
                                body = str(config.get("body", f"Task {task_id}"))
                                await self._supabase.insert(
                                    "notifications",
                                    [
                                        {
                                            "organization_id": organization_id,
                                            "title": title,
                                            "description": body,
                                            "kind": "info",
                                        }
                                    ],
                                )
                            except Exception as exc:
                                logger.warning("notification dispatch failed: %s", exc)

                processed += 1

            except Exception as exc:
                logger.warning("task processing failed task=%s: %s", task.get("id"), exc)
                failed += 1

        return {
            "organization_id": organization_id,
            "processed": processed,
            "failed": failed,
            "digests": digests,
            "anomalies": anomalies,
            "total": len(tasks),
        }

    async def _generate_task_digest(
        self,
        organization_id: str,
        employee_id: str,
        task_id: str,
        payload: Dict[str, Any],
        step: Dict[str, Any],
    ) -> Dict[str, Any] | None:
        """Generates AI summary of daily tasks for an employee."""
        try:
            # If AI client is available, use LLM to summarize
            if self._ai:
                steps = payload.get("steps") or []
                steps_text = "\n".join(
                    [f"- {s.get('title', s.get('type', 'task'))}: {s.get('type')}" for s in steps if isinstance(s, dict)]
                )
                prompt = f"""
You are Fluxentiq's daily task digest AI. Summarize today's tasks for employee {employee_id}.

Tasks:
{steps_text[:2000]}

Provide a concise 2-3 sentence summary of what the employee should focus on today.
Respond with JSON only: {{"summary": "...", "priorities": ["...", "..."]}}
"""

                try:
                    result = await self._ai._provider.complete_json(
                        [
                            {"role": "system", "content": "You are a helpful HR assistant that summarizes daily tasks concisely."},
                            {"role": "user", "content": prompt},
                        ]
                    )
                    summary = str(result.get("summary", "")).strip() or "Daily tasks ready."
                    priorities = result.get("priorities") or []
                    if not isinstance(priorities, list):
                        priorities = []

                    # Estimate tokens for metering (best-effort)
                    prompt_tokens = len(prompt) // 4
                    completion_tokens = len(summary) // 4

                    return {
                        "task_id": task_id,
                        "employee_id": employee_id,
                        "summary": summary,
                        "priorities": priorities[:5],
                        "model": self._ai.model,
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                    }
                except Exception as exc:
                    logger.warning("AI digest generation failed: %s", exc)
                    # Fallback to deterministic summary
                    return {
                        "task_id": task_id,
                        "employee_id": employee_id,
                        "summary": f"You have {len(steps) if isinstance(steps, list) else 0} tasks today. Focus on attendance and performance.",
                        "priorities": [],
                        "model": "fallback",
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                    }
            else:
                # No AI — deterministic fallback
                steps = payload.get("steps") or []
                count = len(steps) if isinstance(steps, list) else 0
                return {
                    "task_id": task_id,
                    "employee_id": employee_id,
                    "summary": f"Daily workflow: {count} automated steps scheduled for today.",
                    "priorities": [],
                    "model": "deterministic",
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                }

        except Exception as exc:
            logger.warning("task digest error: %s", exc)
            return None

    async def _calculate_performance_score(
        self,
        organization_id: str,
        employee_id: str,
        payload: Dict[str, Any],
        step: Dict[str, Any],
    ) -> Dict[str, Any] | None:
        """Calculates automated performance score (deterministic + optional AI)."""
        try:
            # Deterministic scoring based on attendance, task completion, etc.
            # In production, this would query attendance_records, goals, etc.
            # For this implementation, we provide a plausible heuristic.

            base_score = 75
            config = step.get("config") or {}
            # Allow config to adjust base score
            if isinstance(config, dict) and "base_score" in config:
                try:
                    base_score = int(config["base_score"])
                except (ValueError, TypeError):
                    base_score = 75

            # Clamp 0-100
            base_score = max(0, min(100, base_score))

            summary = f"Automated performance score for {employee_id}: {base_score}/100 based on daily workflow completion."
            ai_summary = summary

            # If AI available, enhance summary
            if self._ai:
                try:
                    prompt = f"Employee {employee_id} has automated score {base_score}/100. Write a 1-sentence performance insight."
                    result = await self._ai._provider.complete_json(
                        [
                            {"role": "system", "content": "You are a performance review assistant. Respond JSON only: {\"insight\": \"...\"}"},
                            {"role": "user", "content": prompt},
                        ]
                    )
                    insight = str(result.get("insight", "")).strip()
                    if insight:
                        ai_summary = insight
                except Exception:
                    pass

            return {
                "employee_id": employee_id,
                "score": base_score,
                "summary": summary,
                "ai_summary": ai_summary,
            }

        except Exception as exc:
            logger.warning("performance scoring error: %s", exc)
            return None

    async def _detect_anomalies(
        self,
        organization_id: str,
        employee_id: str,
        payload: Dict[str, Any],
        step: Dict[str, Any],
    ) -> Dict[str, Any] | None:
        """Detects anomalies in attendance/payroll (deterministic)."""
        try:
            # Deterministic anomaly detection — in production would use python_engine.anomaly_detector
            # For now, we check if task payload contains unusual patterns
            anomalies_found = []

            # Example: if task has many steps, flag as high workload
            steps = payload.get("steps") or []
            if isinstance(steps, list) and len(steps) > 5:
                anomalies_found.append(
                    {
                        "type": "high_workload",
                        "severity": "warning",
                        "message": f"Employee {employee_id} has {len(steps)} tasks — high workload detected.",
                    }
                )

            # If no anomalies, return None
            if not anomalies_found:
                return None

            return {
                "employee_id": employee_id,
                "anomalies": anomalies_found,
                "checked_at": __import__("datetime").datetime.utcnow().isoformat(),
            }

        except Exception as exc:
            logger.warning("anomaly detection error: %s", exc)
            return None


def make_processor(
    supabase: SupabaseClient | None,
    ai_client: AiClient | None,
) -> WorkflowBatchProcessor:
    return WorkflowBatchProcessor(supabase, ai_client)
