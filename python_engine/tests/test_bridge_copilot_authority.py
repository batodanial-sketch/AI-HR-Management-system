"""Phase R1 — Python bridge authority tests (real FastAPI app, fake LLM).

The bridge never knows the calling user's role, so its security contract is:

* it authenticates the Next.js proxy (shared secret) — fail closed;
* the tenant comes ONLY from the trusted ``X-Organization-Id`` header, never
  from the request body / copilot ``context`` (model- and client-influenced);
* tool execution is opt-in (``execute_tools`` defaults to False) and refused
  when no trusted tenant is established;
* when it does execute a tool, every read/write is pinned to that tenant.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import pytest

os.environ.setdefault("BRIDGE_SECRET_KEY", "r1-test-secret")

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
from bridge.models import CopilotRequest, ToolCall  # noqa: E402
from bridge.tools import ToolExecutor  # noqa: E402

SECRET_HEADERS = {"X-Bridge-Secret": "r1-test-secret"}
ORG = "11111111-1111-1111-1111-111111111111"
OTHER_ORG = "22222222-2222-2222-2222-222222222222"


class FakeAi:
    """Emits one tool call and a `done` event, like the real planner."""

    model = "fake-model"

    def __init__(self, tool_calls: list[dict[str, Any]]) -> None:
        self._tool_calls = tool_calls

    async def stream_copilot(self, request: CopilotRequest):
        yield {"type": "delta", "text": "ok"}
        yield {"type": "done", "result": {"tool_calls": self._tool_calls}}

    def last_usage(self) -> tuple[int, int]:
        return (1, 1)


class RecordingSupabase:
    """Records every select/update the tool executor issues."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    async def select(self, table: str, *, columns: str = "*", filters=None, limit: int = 100):
        self.calls.append(("select", table, dict(filters or {})))
        if table == "leave_requests":
            return [{"id": "lr-1", "employee_name": "Ana", "status": "pending"}]
        if table == "candidates":
            return [{"id": "c-1", "first_name": "Bob", "last_name": "Lee", "stage": "applied"}]
        return []

    async def update(self, table: str, match: dict[str, str], patch: dict[str, Any]) -> None:
        self.calls.append(("update", table, dict(match)))


class RecordingExecutor:
    def __init__(self) -> None:
        self.executed: list[tuple[str, str | None]] = []

    async def execute(self, call: ToolCall, organization_id: str | None):
        self.executed.append((call.tool, organization_id))
        from bridge.models import ToolResult

        return ToolResult(tool=call.tool, ok=True, message="executed")


def _events(body: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload == "[DONE]":
            continue
        out.append(json.loads(payload))
    return out


@pytest.fixture()
def bridge(monkeypatch):
    executor = RecordingExecutor()
    monkeypatch.setattr(server, "ai", FakeAi([{"tool": "approve_leave", "arguments": {"employee_name": "Ana"}}]))
    monkeypatch.setattr(server, "tool_executor", executor)
    monkeypatch.setattr(server, "rate_limiter", None)
    monkeypatch.setattr(server, "usage_recorder", None)
    return TestClient(server.app), executor


def _copilot(client: TestClient, *, headers: dict[str, str], **body_overrides):
    body: dict[str, Any] = {"messages": [{"role": "user", "content": "approve Ana's leave"}]}
    body.update(body_overrides)
    return client.post("/api/ai/copilot", json=body, headers=headers)


def test_execute_tools_defaults_to_false() -> None:
    assert CopilotRequest(messages=[]).execute_tools is False


def test_missing_bridge_secret_is_rejected(bridge) -> None:
    client, executor = bridge
    response = _copilot(client, headers={}, execute_tools=True)
    assert response.status_code == 401
    assert executor.executed == []


def test_forged_secret_is_rejected(bridge) -> None:
    client, executor = bridge
    response = _copilot(client, headers={"X-Bridge-Secret": "wrong"}, execute_tools=True)
    assert response.status_code == 401
    assert executor.executed == []


def test_default_mode_streams_tool_calls_without_executing(bridge) -> None:
    client, executor = bridge
    response = _copilot(client, headers={**SECRET_HEADERS, "X-Organization-Id": ORG})
    assert response.status_code == 200
    events = _events(response.text)
    done = [e for e in events if e.get("type") == "done"]
    assert done and done[0]["result"]["tool_calls"][0]["tool"] == "approve_leave"
    assert not [e for e in events if e.get("type") == "tool_result"]
    assert executor.executed == []


def test_body_context_cannot_select_tenant(bridge) -> None:
    """context.organization_id is ignored; without a trusted header nothing runs."""
    client, executor = bridge
    response = _copilot(
        client,
        headers=SECRET_HEADERS,
        execute_tools=True,
        context={"organization_id": OTHER_ORG},
    )
    assert response.status_code == 200
    results = [e for e in _events(response.text) if e.get("type") == "tool_result"]
    assert results and results[0]["result"]["ok"] is False
    assert "tenant" in results[0]["result"]["message"].lower()
    assert executor.executed == []


def test_body_context_cannot_override_trusted_tenant(bridge) -> None:
    client, executor = bridge
    response = _copilot(
        client,
        headers={**SECRET_HEADERS, "X-Organization-Id": ORG},
        execute_tools=True,
        context={"organization_id": OTHER_ORG},
    )
    assert response.status_code == 200
    assert executor.executed == [("approve_leave", ORG)]


def test_org_id_resolution_uses_header_only() -> None:
    assert server._org_id_from_request(None, {"organization_id": OTHER_ORG}) is None


def test_tool_executor_refuses_without_tenant() -> None:
    supabase = RecordingSupabase()
    executor = ToolExecutor(supabase)  # type: ignore[arg-type]
    result = asyncio.run(executor.execute(ToolCall(tool="approve_leave", arguments={"employee_name": "Ana"}), None))
    assert result.ok is False
    assert supabase.calls == []


@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("approve_leave", {"employee_name": "Ana"}),
        ("reject_leave", {"employee_name": "Ana"}),
        ("advance_candidate", {"candidate_name": "Bob Lee"}),
    ],
)
def test_tool_executor_pins_every_query_to_tenant(tool: str, arguments: dict[str, Any]) -> None:
    supabase = RecordingSupabase()
    executor = ToolExecutor(supabase)  # type: ignore[arg-type]
    result = asyncio.run(executor.execute(ToolCall(tool=tool, arguments=arguments), ORG))
    assert result.ok is True, result.message
    assert supabase.calls, "expected database access"
    for _op, _table, filters in supabase.calls:
        assert filters.get("organization_id") == ORG


def test_tool_executor_rejects_unknown_tool() -> None:
    supabase = RecordingSupabase()
    executor = ToolExecutor(supabase)  # type: ignore[arg-type]
    result = asyncio.run(executor.execute(ToolCall(tool="drop_tenant", arguments={}), ORG))
    assert result.ok is False
    assert supabase.calls == []
