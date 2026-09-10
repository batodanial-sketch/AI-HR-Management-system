/**
 * Agent foundation — taxonomy completeness, router determinism, policy
 * narrowing, and the new read-tool executor contract.
 *
 * Pure modules load for real; only the tool executor's fetch is stubbed.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import { COPILOT_TOOL_CATALOG, COPILOT_TOOL_NAMES, toolSpecsForBridge } from "@/lib/ai-providers";
import {
  ACTION_CATEGORIES,
  categoryForTool,
  requiresConfirmation,
  requiresPrivilegedApprover,
  TOOL_ACTION_CATEGORIES,
  type ActionCategory,
} from "@/lib/agents/taxonomy";
import { classifyIntent, routeConversation } from "@/lib/agents/router";
import { AGENT_POLICIES, policiesValid, resolveAgentTools } from "@/lib/agents/policies";
import { executeCopilotTool, findCopilotTool, validateToolArguments } from "@/lib/copilot/tools";

describe("HITL taxonomy", () => {
  it("covers every catalog tool exactly once", () => {
    expect(Object.keys(TOOL_ACTION_CATEGORIES).sort()).toEqual([...COPILOT_TOOL_NAMES].sort());
    for (const name of COPILOT_TOOL_NAMES) {
      expect(ACTION_CATEGORIES).toContain(TOOL_ACTION_CATEGORIES[name]);
    }
  });
  it("fails closed: unknown tools are CONSEQUENT", () => {
    expect(categoryForTool("no_such_tool")).toBe("CONSEQUENT");
    expect(categoryForTool("")).toBe("CONSEQUENT");
  });
  it("confirmation mapping matches the proposal lifecycle", () => {
    const confirmed: ActionCategory[] = ["WRITE", "CONSEQUENT"];
    for (const c of ACTION_CATEGORIES) {
      expect(requiresConfirmation(c)).toBe(confirmed.includes(c));
      expect(requiresPrivilegedApprover(c)).toBe(confirmed.includes(c));
    }
  });
  it("classifies the consequential writes honestly", () => {
    expect(categoryForTool("approve_offboarding")).toBe("CONSEQUENT");
    expect(categoryForTool("screen_candidate")).toBe("CONSEQUENT");
    expect(categoryForTool("create_expense")).toBe("WRITE");
    expect(categoryForTool("get_hr_briefing")).toBe("ANALYZE");
    expect(categoryForTool("search_candidates")).toBe("READ");
  });
});

describe("intent router", () => {
  it("routes recruitment requests to the recruitment agent", () => {
    const d = classifyIntent("Show me backend candidates ready for interview");
    expect(d.agent).toBe("recruitment");
    expect(d.reasons).toContain("keyword:candidate");
  });
  it("routes workforce questions to the intelligence agent", () => {
    const d = classifyIntent("Brief me on turnover trends and flight risk");
    expect(d.agent).toBe("intelligence");
    expect(d.reasons).toContain("keyword:brief me");
  });
  it("defaults to general on weak or empty signals", () => {
    expect(classifyIntent("hello").agent).toBe("general");
    expect(classifyIntent("").agent).toBe("general");
    expect(classifyIntent("hello").confidence).toBe(0);
  });
  it("breaks ties toward intelligence with an explicit reason", () => {
    const d = classifyIntent("hiring trends");
    expect(d.agent).toBe("intelligence");
    expect(d.reasons).toContain("tie-break:intelligence");
  });
  it("is deterministic and routes by the latest user message", () => {
    const a = classifyIntent("rank the job applicants");
    const b = classifyIntent("rank the job applicants");
    expect(a).toEqual(b);
    const routed = routeConversation([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "screen the new applicants" },
    ]);
    expect(routed.agent).toBe("recruitment");
    expect(routeConversation([]).agent).toBe("general");
  });
});

describe("agent policies", () => {
  it("every policy tool exists in the catalog", () => {
    expect(policiesValid()).toBe(true);
  });
  it("intelligence is read-only; recruitment has exactly one proposal-gated write", () => {
    const kindOf = (name: string) => COPILOT_TOOL_CATALOG.find((t) => t.name === name)?.kind;
    expect(AGENT_POLICIES.intelligence.tools.every((t) => kindOf(t) === "read")).toBe(true);
    expect(AGENT_POLICIES.recruitment.tools.filter((t) => kindOf(t) === "write")).toEqual(["screen_candidate"]);
  });
  it("resolveAgentTools intersects (never widens); unknown agent → general", () => {
    expect(resolveAgentTools("intelligence", ["get_hr_briefing", "screen_candidate"])).toEqual(["get_hr_briefing"]);
    expect(resolveAgentTools("recruitment", ["search_candidates", "create_asset"])).toEqual(["search_candidates"]);
    expect(resolveAgentTools("nope", ["fetch_expenses"])).toEqual(["fetch_expenses"]);
    expect(resolveAgentTools(undefined, ["fetch_expenses"])).toEqual(["fetch_expenses"]);
  });
  it("bridge specs pass the new tools through", () => {
    const specs = toolSpecsForBridge(["search_candidates", "get_hr_briefing"]);
    expect(specs.map((s) => s.name).sort()).toEqual(["get_hr_briefing", "search_candidates"]);
  });
});

describe("new read tools (executor contract)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("validates search_candidates args (stage enum + limit bounds)", () => {
    const def = findCopilotTool("search_candidates");
    expect(def).not.toBeNull();
    expect(validateToolArguments(def!, { query: "lena", stage: "screening", limit: 5 }).ok).toBe(true);
    expect(validateToolArguments(def!, {}).ok).toBe(true);
    expect(validateToolArguments(def!, { stage: "nope" }).ok).toBe(false);
    expect(validateToolArguments(def!, { limit: 500 }).ok).toBe(false);
    expect(validateToolArguments(findCopilotTool("get_workforce_insights")!, {}).ok).toBe(true);
    expect(validateToolArguments(findCopilotTool("get_hr_briefing")!, {}).ok).toBe(true);
  });
  it("executes GET tools with a bounded query string + forwarded session", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: [{ id: "c1" }], count: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const def = findCopilotTool("search_candidates")!;
    const result = await executeCopilotTool(def, { query: "lena", limit: 5 }, { origin: "http://app.test", cookie: "session=abc" });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("http://app.test/api/candidates?query=lena&limit=5");
    expect(init.headers.cookie).toBe("session=abc");
  });
  it("surfaces tool-route failures without crashing", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "RBAC: HR_ADMIN role required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const def = findCopilotTool("get_hr_briefing")!;
    const result = await executeCopilotTool(def, {}, { origin: "http://app.test", cookie: "" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
});
