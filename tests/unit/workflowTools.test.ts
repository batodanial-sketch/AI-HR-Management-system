/**
 * Workflow ↔ copilot bridge proofs: catalog parity, arg validation, dynamic
 * run-start path, step-level access tiers, and agent policy narrowing.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import { COPILOT_TOOL_CATALOG } from "@/lib/ai-providers";
import { COPILOT_TOOL_MODULES, findCopilotTool, validateToolArguments } from "@/lib/copilot/tools";
import { categoryForTool } from "@/lib/agents/taxonomy";
import { AGENT_POLICIES, resolveAgentTools } from "@/lib/agents/policies";
import { workflowToolAccess } from "@/lib/workflows/executor";

const UUID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

const ALL_SIX = ["fetch_workflows", "fetch_workflow_runs", "fetch_workflow_approvals", "start_workflow_run", "get_workflow", "propose_workflow"];

describe("workflow copilot tools", () => {
  it("registers all six tools with definitions, modules and taxonomy tiers", () => {
    for (const name of ALL_SIX) {
      expect(COPILOT_TOOL_CATALOG.some((t) => t.name === name)).toBe(true);
      expect(findCopilotTool(name)).not.toBeNull();
      expect(COPILOT_TOOL_MODULES[name]).toBe("workflows");
    }
    expect(categoryForTool("fetch_workflows")).toBe("READ");
    expect(categoryForTool("fetch_workflow_runs")).toBe("READ");
    expect(categoryForTool("fetch_workflow_approvals")).toBe("READ");
    expect(categoryForTool("get_workflow")).toBe("READ");
    expect(categoryForTool("start_workflow_run")).toBe("WRITE");
    expect(categoryForTool("propose_workflow")).toBe("PROPOSE");
  });

  it("validates run-start args (uuid workflow, pipe-free key)", () => {
    const definition = findCopilotTool("start_workflow_run");
    if (!definition) throw new Error("missing tool");
    expect(validateToolArguments(definition, { workflowId: UUID })).toEqual({ ok: true, args: { workflowId: UUID } });
    expect(validateToolArguments(definition, { workflowId: "nope" }).ok).toBe(false);
    expect(validateToolArguments(definition, { workflowId: UUID, idempotencyKey: "a|b" }).ok).toBe(false);
  });

  it("builds the nested run-start path from validated args", () => {
    const definition = findCopilotTool("start_workflow_run");
    if (!definition?.toPath) throw new Error("missing toPath");
    expect(definition.toPath({ workflowId: UUID })).toBe(`/api/workflows/${UUID}/run`);
  });

  it("tiers step access: workflow reads inline, run-start proposal-only", () => {
    expect(workflowToolAccess("fetch_workflows")).toBe("inline");
    expect(workflowToolAccess("fetch_workflow_runs")).toBe("inline");
    expect(workflowToolAccess("fetch_workflow_approvals")).toBe("inline");
    expect(workflowToolAccess("start_workflow_run")).toBe("proposal");
    // Writes outside the proposal set stay denied — no silent escalation.
    expect(workflowToolAccess("create_expense")).toBe("denied");
    expect(workflowToolAccess("no_such_tool")).toBe("denied");
  });

  it("propose_workflow maps template args to the route body and validates steps deeply", () => {
    const definition = findCopilotTool("propose_workflow");
    if (!definition?.toBody) throw new Error("missing toBody");
    const validated = validateToolArguments(definition, { templateId: "new_hire_welcome", templateParams: { notifyUserIds: [UUID] } });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error("unreachable");
    expect(definition.toBody(validated.args)).toEqual({
      fromTemplate: { templateId: "new_hire_welcome", params: { notifyUserIds: [UUID] } },
    });
    // Unknown templates and non-vocabulary steps die at the tool boundary.
    expect(validateToolArguments(definition, { templateId: "nope" }).ok).toBe(false);
    expect(validateToolArguments(definition, { steps: [{ key: "x", type: "webhook_call", title: "X", config: {} }] }).ok).toBe(false);
    const goodSteps = validateToolArguments(definition, { steps: [{ key: "done", type: "end", title: "Done", config: {} }] });
    expect(goodSteps.ok).toBe(true);
  });

  it("get_workflow builds the nested definition path", () => {
    const definition = findCopilotTool("get_workflow");
    if (!definition?.toPath) throw new Error("missing toPath");
    expect(definition.toPath({ workflowId: UUID })).toBe(`/api/workflows/${UUID}`);
    expect(validateToolArguments(definition, { workflowId: "nope" }).ok).toBe(false);
  });

  it("narrows by agent: general inherits, specialists stay out", () => {
    expect(resolveAgentTools("general", ALL_SIX)).toEqual(ALL_SIX);
    expect(resolveAgentTools("intelligence", ALL_SIX)).toEqual([]);
    expect(resolveAgentTools("recruitment", ALL_SIX)).toEqual([]);
    expect(AGENT_POLICIES.general.tools).toEqual(expect.arrayContaining(ALL_SIX));
  });

  it("exposes no approve/deny tool — decisions are UI-only", () => {
    const names = COPILOT_TOOL_CATALOG.map((t) => t.name);
    expect(names.some((n) => /approv/i.test(n) && n !== "fetch_workflow_approvals" && n !== "approve_offboarding")).toBe(false);
    expect(names).not.toContain("approve_workflow");
    expect(names).not.toContain("deny_workflow");
    // …and no lifecycle tool: activation/deletion are human-only.
    expect(names).not.toContain("activate_workflow");
    expect(names).not.toContain("delete_workflow");
    expect(findCopilotTool("approve_offboarding")).not.toBeNull(); // unrelated tool untouched
  });
});
