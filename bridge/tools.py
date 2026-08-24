"""Copilot tool execution — turns model-emitted tool calls into real side
effects against the canonical Supabase database.

Tools:
  * approve_leave     — approves a pending leave request for an employee.
  * reject_leave      — rejects a pending leave request for an employee.
  * advance_candidate — advances a candidate to the next recruitment stage.

When Supabase is not configured (demo mode), tools return a graceful
``ok`` result with a clear "(demo)" message so the Copilot loop still completes.
"""

from __future__ import annotations

import logging
from typing import Any

from .models import ToolCall, ToolResult
from .supabase_client import SupabaseClient

logger = logging.getLogger("fluxentiq.bridge.tools")

_STAGE_ORDER = ["applied", "screening", "interview", "offer", "hired"]


def _next_stage(stage: str) -> str | None:
    if stage not in _STAGE_ORDER:
        return "screening"
    index = _STAGE_ORDER.index(stage)
    if index + 1 >= len(_STAGE_ORDER):
        return None
    return _STAGE_ORDER[index + 1]


class ToolExecutor:
    """Executes Copilot tool calls against Supabase (or demo fallback)."""

    def __init__(self, supabase: SupabaseClient | None) -> None:
        self._supabase = supabase

    async def execute(
        self, call: ToolCall, organization_id: str | None
    ) -> ToolResult:
        try:
            if call.tool == "approve_leave":
                return await self._approve_leave(call.arguments, organization_id)
            if call.tool == "reject_leave":
                return await self._reject_leave(call.arguments, organization_id)
            if call.tool == "advance_candidate":
                return await self._advance_candidate(call.arguments, organization_id)
            return ToolResult(tool=call.tool, ok=False, message=f"Unknown tool: {call.tool}")
        except Exception as exc:  # noqa: BLE001 — never crash the copilot loop
            logger.exception("Tool %s failed", call.tool)
            return ToolResult(tool=call.tool, ok=False, message=str(exc))

    def _name(self, arguments: dict[str, Any], key: str) -> str:
        value = arguments.get(key)
        return str(value).strip() if value else ""

    async def _approve_leave(
        self, arguments: dict[str, Any], organization_id: str | None
    ) -> ToolResult:
        name = self._name(arguments, "employee_name")
        if not name:
            return ToolResult(tool="approve_leave", ok=False, message="Missing employee_name.")
        if not self._supabase:
            return ToolResult(
                tool="approve_leave",
                ok=True,
                message=f"Approved leave for {name} (demo mode — Supabase not configured).",
            )
        rows = await self._supabase.select(
            "leave_requests",
            columns="id, employee_name, status",
            filters={"employee_name": name, "status": "pending"},
            limit=1,
        )
        if not rows:
            return ToolResult(
                tool="approve_leave",
                ok=False,
                message=f"No pending leave request found for {name}.",
            )
        await self._supabase.update(
            "leave_requests",
            {"id": rows[0]["id"]},
            {"status": "approved"},
        )
        return ToolResult(tool="approve_leave", ok=True, message=f"Approved leave for {name}.")

    async def _reject_leave(
        self, arguments: dict[str, Any], organization_id: str | None
    ) -> ToolResult:
        name = self._name(arguments, "employee_name")
        if not name:
            return ToolResult(tool="reject_leave", ok=False, message="Missing employee_name.")
        if not self._supabase:
            return ToolResult(
                tool="reject_leave",
                ok=True,
                message=f"Rejected leave for {name} (demo mode — Supabase not configured).",
            )
        rows = await self._supabase.select(
            "leave_requests",
            columns="id, employee_name, status",
            filters={"employee_name": name, "status": "pending"},
            limit=1,
        )
        if not rows:
            return ToolResult(
                tool="reject_leave",
                ok=False,
                message=f"No pending leave request found for {name}.",
            )
        await self._supabase.update(
            "leave_requests",
            {"id": rows[0]["id"]},
            {"status": "rejected"},
        )
        return ToolResult(tool="reject_leave", ok=True, message=f"Rejected leave for {name}.")

    async def _advance_candidate(
        self, arguments: dict[str, Any], organization_id: str | None
    ) -> ToolResult:
        name = self._name(arguments, "candidate_name")
        if not name:
            return ToolResult(tool="advance_candidate", ok=False, message="Missing candidate_name.")
        if not self._supabase:
            return ToolResult(
                tool="advance_candidate",
                ok=True,
                message=f"Advanced {name} to the next stage (demo mode — Supabase not configured).",
            )
        # Resolve candidate by first+last name, then move one stage forward.
        rows = await self._supabase.select(
            "candidates",
            columns="id, first_name, last_name, stage",
            limit=200,
        )
        match = next(
            (
                row
                for row in rows
                if f"{row.get('first_name', '')} {row.get('last_name', '')}".strip().lower()
                == name.lower()
            ),
            None,
        )
        if not match:
            return ToolResult(
                tool="advance_candidate",
                ok=False,
                message=f"No candidate found matching {name}.",
            )
        current = match.get("stage", "applied")
        target = _next_stage(current)
        if target is None:
            return ToolResult(
                tool="advance_candidate",
                ok=False,
                message=f"{name} is already at the final stage.",
            )
        await self._supabase.update("candidates", {"id": match["id"]}, {"stage": target})
        return ToolResult(
            tool="advance_candidate",
            ok=True,
            message=f"Advanced {name} from {current} to {target}.",
        )


def make_executor(supabase: SupabaseClient | None) -> ToolExecutor:
    return ToolExecutor(supabase)
