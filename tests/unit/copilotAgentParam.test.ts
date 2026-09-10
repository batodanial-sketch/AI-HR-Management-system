/**
 * Copilot `agent` parameter — route-level wiring.
 *
 * Drives the REAL route handler with the bridge fetch stubbed (planner
 * returns a final answer, so no tools execute) and session/license/budget
 * seams mocked. Proves: policy narrowing reaches the planner, the agent hint
 * travels in context, `auto` classifies, forbidden tools 400, and the
 * default (no agent) behavior is unchanged.
 */
jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ getAll: () => [], set: () => {} }) }));

import type { RbacContext } from "@/lib/rbac";

const getRbacContext = jest.fn<Promise<RbacContext>, []>();
jest.mock("@/lib/rbac", () => ({
  getRbacContext: () => getRbacContext(),
  rbacErrorResponse: () => null,
}));

jest.mock("@/lib/ai-proxy", () => ({
  proxyToBridge: () => {
    throw new Error("classic proxy must not run in agentic tests");
  },
  bridgeUrl: () => "http://bridge.test",
  bridgeSecret: () => "unit-test-secret",
  BRIDGE_LLM_TIMEOUT_MS: 5_000,
}));

jest.mock("@/lib/license", () => ({ getLicenseState: async () => ({ tier: "pro" }) }));
jest.mock("@/lib/ai/telemetry", () => ({
  checkAiBudget: async () => ({ allowed: true, threshold: "ok", remainingTokens: null, remainingCostUsd: null, fallbackModel: null, fallbackProvider: null }),
  recordAiTelemetry: () => undefined,
}));
jest.mock("@/lib/supabase/server", () => ({ hasSupabaseEnv: () => false, serverClient: () => { throw new Error("no db"); } }));
const auditSpy = jest.fn(async () => undefined);
jest.mock("@/lib/audit", () => ({ recordAuditLog: (...a: unknown[]) => auditSpy(...(a as [])) }));

import { POST } from "@/app/api/ai/copilot/route";

const adminCtx: RbacContext = {
  user: { id: "u1", email: "a@x.test", fullName: "A", organizationId: "org-1", role: "admin" },
  organizationId: "org-1",
  role: "HR_ADMIN",
  scope: "org",
  employeeId: null,
  reportIds: [],
  demoMode: true,
  roleCode: "admin",
  membershipId: null,
};

function sseDone(text: string): Response {
  return new Response(`data: ${JSON.stringify({ type: "done", result: { text, actions: [] } })}\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function postAgent(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new Request("http://localhost/api/ai/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getRbacContext.mockResolvedValue(adminCtx);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("copilot agent parameter", () => {
  it("narrows planner tools to the recruitment policy + forwards the hint", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(sseDone("hi"));
    const res = await postAgent({
      messages: [{ role: "user", content: "find backend candidates" }],
      tools: ["search_candidates", "create_asset"],
      agent: "recruitment",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"type":"route"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const sent = JSON.parse(init.body) as { tools: Array<{ name: string }>; context: Record<string, unknown> };
    expect(sent.tools.map((t) => t.name)).toEqual(["search_candidates"]);
    expect(sent.context.agent).toBe("recruitment");
    expect(typeof sent.context.agent_hint).toBe("string");
  });
  it("auto-classifies intent deterministically", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(sseDone("hi"));
    await postAgent({
      messages: [{ role: "user", content: "brief me on turnover trends" }],
      tools: ["get_hr_briefing"],
      agent: "auto",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const sent = JSON.parse(init.body) as { context: Record<string, unknown> };
    expect(sent.context.agent).toBe("intelligence");
  });
  it("400s when no requested tool survives the policy (without planning)", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(sseDone("hi"));
    const res = await postAgent({
      messages: [{ role: "user", content: "brief me" }],
      tools: ["screen_candidate"],
      agent: "intelligence",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects unknown agent values", async () => {
    const res = await postAgent({
      messages: [{ role: "user", content: "hi" }],
      tools: ["fetch_expenses"],
      agent: "nope",
    });
    expect(res.status).toBe(400);
  });
  it("default behavior is unchanged when agent is unset (no route event, all tools)", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(sseDone("hi"));
    const res = await postAgent({
      messages: [{ role: "user", content: "list my expenses" }],
      tools: ["fetch_expenses", "create_expense"],
    });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('"type":"route"');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const sent = JSON.parse(init.body) as { tools: Array<{ name: string }> };
    expect(sent.tools.map((t) => t.name).sort()).toEqual(["create_expense", "fetch_expenses"]);
  });
});
