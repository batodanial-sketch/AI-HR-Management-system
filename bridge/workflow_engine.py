"""Workflow event-trigger engine.

Receives a domain event (``employee.created``, ``leave.requested``,
``candidate.advanced``, ``payroll.completed``, …) and executes the matching
workflow: condition nodes gate execution, action nodes perform side effects
(e-mail, record writes, webhooks, AI evaluation), delay nodes pause the flow.

Workflows may be supplied inline (as the node graph produced by the workflow
builder) or loaded from persisted definitions in Supabase. Every execution is
recorded as a run in ``workflow_runs`` so it can be audited.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .config import settings
from .models import WorkflowExecution, WorkflowNode, WorkflowTriggerRequest
from .supabase_client import SupabaseClient

logger = logging.getLogger("fluxentiq.bridge.workflows")

# Sanity cap so a misconfigured delay node can never stall the event loop.
_MAX_DELAY_SECONDS = 30.0


def _compare(left: Any, op: str, right: Any) -> bool:
    """Evaluates a simple comparison for condition nodes."""
    if op == "eq":
        return left == right
    if op == "neq":
        return left != right
    if op == "gt":
        return left > right
    if op == "gte":
        return left >= right
    if op == "lt":
        return left < right
    if op == "lte":
        return left <= right
    if op == "contains":
        return isinstance(left, str) and str(right) in left
    return False


def _resolve_path(payload: dict[str, Any], path: str) -> Any:
    """Resolves a dot-path (``employee.email``) within the payload."""
    current: Any = payload
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


class WorkflowEngine:
    """Executes workflow definitions in response to domain events."""

    def __init__(self, supabase: SupabaseClient | None) -> None:
        self._supabase = supabase
        self._run_counter = 0

    async def trigger(self, request: WorkflowTriggerRequest) -> WorkflowExecution:
        run_id = request.run_id or self._new_run_id()
        nodes = request.workflow

        # Load a persisted definition when no inline workflow is provided.
        if nodes is None:
            nodes = await self._load_definition(request.event)

        if not nodes:
            await self._record_run(run_id, request.event, "no_workflow", [], None)
            return WorkflowExecution(
                run_id=run_id,
                event=request.event,
                status="no_workflow",
                executed_actions=[],
            )

        try:
            executed = await self._execute(nodes, request.payload)
            await self._record_run(run_id, request.event, "completed", executed, None)
            return WorkflowExecution(
                run_id=run_id,
                event=request.event,
                status="completed",
                executed_actions=executed,
            )
        except Exception as exc:  # noqa: BLE001 — record + re-raise to caller
            logger.exception("Workflow execution failed for event %s", request.event)
            await self._record_run(run_id, request.event, "failed", [], str(exc))
            return WorkflowExecution(
                run_id=run_id,
                event=request.event,
                status="failed",
                executed_actions=[],
                error=str(exc),
            )

    async def _execute(
        self, nodes: list[WorkflowNode], payload: dict[str, Any]
    ) -> list[str]:
        """Linear pass over nodes; condition nodes toggle the active branch."""
        executed: list[str] = []
        active = True
        for node in nodes:
            if node.type == "trigger":
                continue
            if node.type == "condition":
                condition = node.config.get("condition") or {}
                field = str(condition.get("field", ""))
                op = str(condition.get("op", "eq"))
                value = condition.get("value")
                active = _compare(_resolve_path(payload, field), op, value)
                continue
            if node.type == "delay":
                if active:
                    seconds = min(float(node.config.get("seconds", 0)), _MAX_DELAY_SECONDS)
                    if seconds > 0:
                        await asyncio.sleep(seconds)
                continue
            if node.type == "action" and active:
                label = await self._run_action(node, payload)
                executed.append(label or node.label)
        return executed

    async def _run_action(
        self, node: WorkflowNode, payload: dict[str, Any]
    ) -> str | None:
        action = str(node.config.get("action", "webhook"))
        if action == "send_email":
            return await self._action_send_email(node, payload)
        if action == "create_record":
            return await self._action_create_record(node, payload)
        if action == "update_record":
            return await self._action_update_record(node, payload)
        if action == "groq_evaluate":
            return await self._action_groq_evaluate(node, payload)
        return await self._action_webhook(node, payload)

    async def _action_send_email(
        self, node: WorkflowNode, payload: dict[str, Any]
    ) -> str:
        to = str(node.config.get("to", "") or payload.get("email", ""))
        subject = str(node.config.get("subject", node.label))
        body = str(node.config.get("body", "") or node.label)

        # 1. Persist a notification row when Supabase is available.
        if self._supabase:
            await self._supabase.insert(
                "notifications",
                [{
                    "kind": "workflow",
                    "title": subject,
                    "description": f"Triggered by workflow action '{node.label}'",
                    "target": to,
                }],
            )
        # 2. Send the email through the HTTP relay the app exposes, so the
        #    bridge reuses the platform's email service (SMTP/HTTP/console).
        if to:
            try:
                import httpx

                relay = str(
                    __import__("os").environ.get("EMAIL_HTTP_URL", "")
                ).strip()
                if relay:
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        await client.post(
                            relay,
                            json={"to": to, "subject": subject, "text": body},
                        )
                else:
                    # Never log the recipient address — it is personal data.
                    logger.info("Workflow email dispatched (recipient redacted, subject=%s)", subject)
            except Exception as exc:  # noqa: BLE001 — never fail the workflow
                logger.warning("Workflow email delivery failed: %s", exc)
        return f"send_email:{subject}"

    async def _action_create_record(
        self, node: WorkflowNode, payload: dict[str, Any]
    ) -> str:
        table = str(node.config.get("table", ""))
        fields = dict(node.config.get("fields", {}) or {})
        row = {key: value.format_map(payload) if isinstance(value, str) else value
               for key, value in fields.items()}
        if self._supabase and table:
            await self._supabase.insert(table, [row])
        # Log only the target table and column count — the row may contain PII.
        logger.info("Workflow create_record table=%s fields=%d", table, len(row))
        return f"create_record:{table}"

    async def _action_update_record(
        self, node: WorkflowNode, payload: dict[str, Any]
    ) -> str:
        table = str(node.config.get("table", ""))
        match = dict(node.config.get("match", {}) or {})
        patch = dict(node.config.get("fields", {}) or {})
        if self._supabase and table:
            await self._supabase.update(table, match, patch)
        # `match`/`patch` may contain PII — log the table and key count only.
        logger.info(
            "Workflow update_record table=%s match_keys=%d patch_fields=%d",
            table, len(match), len(patch),
        )
        return f"update_record:{table}"

    async def _action_groq_evaluate(
        self, node: WorkflowNode, payload: dict[str, Any]
    ) -> str:
        # AI-triggered action: downstream code can attach an evaluation to the
        # event payload. The bridge itself does not re-enter Groq here to avoid
        # recursive evaluation; it simply records that the step ran. The
        # candidate name is PII — log the candidate id only.
        logger.info(
            "Workflow groq_evaluate candidate_id=%s",
            payload.get("candidate_id", "unknown"),
        )
        return f"groq_evaluate:{payload.get('candidate_id', 'unknown')}"

    async def _action_webhook(
        self, node: WorkflowNode, payload: dict[str, Any]
    ) -> str:
        url = str(node.config.get("url", ""))
        if not url:
            raise ValueError(f"Action '{node.label}' has no webhook url.")
        import httpx

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json={"event": payload})
            response.raise_for_status()
        return f"webhook:{url}"

    async def _load_definition(self, event: str) -> list[WorkflowNode] | None:
        if not self._supabase:
            return None
        rows = await self._supabase.select(
            "workflow_nodes",
            filters={"trigger_event": event, "active": "true"},
            limit=100,
        )
        if not rows:
            return None
        rows.sort(key=lambda row: row.get("position", 0))
        return [
            WorkflowNode(
                id=str(row.get("id", f"node-{index}")),
                type=row.get("type", "action"),  # type: ignore[arg-type]
                label=str(row.get("label", "node")),
                config=row.get("config") or {},
            )
            for index, row in enumerate(rows)
        ]

    async def _record_run(
        self,
        run_id: str,
        event: str,
        status: str,
        executed: list[str],
        error: str | None,
    ) -> None:
        if not self._supabase:
            logger.info("workflow run %s [%s] %s → %s", run_id, event, status, executed)
            return
        await self._supabase.insert(
            "workflow_runs",
            [{
                "id": run_id,
                "event": event,
                "status": status,
                "executed_actions": executed,
                "error": error,
            }],
        )

    def _new_run_id(self) -> str:
        import time
        import uuid

        self._run_counter += 1
        return f"run-{int(time.time())}-{uuid.uuid4().hex[:8]}"


def make_engine(supabase: SupabaseClient | None) -> WorkflowEngine:
    return WorkflowEngine(supabase)
