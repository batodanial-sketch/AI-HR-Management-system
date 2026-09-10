/**
 * Phase F executor proofs: drives the REAL executor against the memory
 * store with recorder seams. Covers the §28 critical cases at engine level:
 * authz/tenant isolation, idempotent resume, bounded retry, approval
 * approve/deny, AI self-approval circuit breaker, tool allowlist, loop
 * ceiling, version pinning, cancellation, audit + notification emission.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import type { RbRole } from "@/lib/authz/model";
import { memoryWorkflowStore } from "@/lib/workflows/store";
import { runIdempotencyKey } from "@/lib/workflows/idempotency";
import {
  SYSTEM_ACTOR,
  applyApprovalDecision,
  canDecideApproval,
  cancelRun,
  driveRun,
  retryRun,
  workflowToolAccess,
  WorkflowDriveError,
  type DriveActor,
  type DriveDeps,
} from "@/lib/workflows/executor";

const ORG = "org-1";
const USER = "11111111-1111-4111-8111-111111111111";
const MEMBER2 = "22222222-2222-4222-8222-222222222222";
const ACTOR: DriveActor = { userId: USER, role: "HR_ADMIN", organizationId: ORG };
const APPROVER: DriveActor = { userId: MEMBER2, role: "HR_ADMIN", organizationId: ORG };

const notifyStep = (key: string, userIds: string[] = [MEMBER2]) => ({
  key,
  type: "notify" as const,
  title: `Notify ${key}`,
  config: { userIds, title: "Hello", body: "Workflow says hi" },
});
const endStep = (key = "done") => ({ key, type: "end" as const, title: "Done", config: {} });
const approvalStep = (key: string, notifyUserIds: string[] = []) => ({
  key,
  type: "approval" as const,
  title: `Approve ${key}`,
  config: {
    title: "Please approve",
    reason: "A consequential step needs a human.",
    approverMinRole: "HR_ADMIN" as const,
    notifyUserIds,
    context: { why: "Consequential test step.", evidence: ["e1"], changes: ["c1"], affected: "user-2", reversible: true },
  },
});

interface Harness {
  deps: DriveDeps;
  notifications: { userId: string; title: string }[];
  audits: { action: string; targetId: string }[];
  toolCalls: { tool: string; args: Record<string, unknown> }[];
  proposals: { toolName: string; args: Record<string, unknown>; actorId: string }[];
  settleResults: Map<string, { ok: boolean; message: string }>;
  clock: { now: Date };
}

function harness(): Harness {
  const store = memoryWorkflowStore();
  store.__seedMembers([USER, MEMBER2]);
  const h: Harness = {
    deps: null as unknown as DriveDeps,
    notifications: [],
    audits: [],
    toolCalls: [],
    proposals: [],
    settleResults: new Map(),
    clock: { now: new Date("2026-09-10T12:00:00Z") },
  };
  h.deps = {
    store,
    notify: async (n) => {
      h.notifications.push({ userId: n.userId, title: n.title });
    },
    audit: async (a) => {
      h.audits.push({ action: a.action, targetId: a.targetId });
    },
    callTool: async (tool, args) => {
      h.toolCalls.push({ tool, args });
      return { ok: true, message: "1 row" };
    },
    proposeToolCall: async (p) => {
      h.proposals.push({ toolName: p.toolName, args: p.args, actorId: p.actorId });
      return { proposalId: `prop-${h.proposals.length}` };
    },
    settleProposal: async (s) => h.settleResults.get(s.proposalId) ?? { ok: true, message: "executed" },
    now: () => new Date(h.clock.now),
  };
  return h;
}

async function makeWorkflow(h: Harness, steps: Record<string, unknown>[], status = "active") {
  const wf = await h.deps.store.createWorkflow(ORG, { name: "Test flow", triggerType: "manual", status }, USER);
  const version = await h.deps.store.saveVersion(ORG, wf.id, { steps: steps as never }, USER);
  return { wf, version };
}

async function makeRun(h: Harness, wfId: string, version: number, stableInput = "k1", trigger: Record<string, unknown> = {}) {
  const { run } = await h.deps.store.createRun({
    organizationId: ORG,
    workflowId: wfId,
    workflowVersion: version,
    idempotencyKey: runIdempotencyKey({ organizationId: ORG, workflowId: wfId, workflowVersion: version, stableInput }),
    triggerPayload: trigger,
    initiatedBy: USER,
  });
  return run;
}

describe("driveRun happy path + branching", () => {
  it("runs notify → end to succeeded with notifications + audit", async () => {
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [notifyStep("n1"), endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    const outcome = await driveRun(h.deps, ORG, run.id, ACTOR);
    expect(outcome).toMatchObject({ outcome: "succeeded" });
    expect(h.notifications).toContainEqual({ userId: MEMBER2, title: "Hello" });
    expect(h.notifications).toContainEqual(expect.objectContaining({ userId: USER }));
    const actions = h.audits.map((a) => a.action);
    expect(actions).toContain("workflow.run.started");
    expect(actions).toContain("workflow.run.succeeded");
    const final = await h.deps.store.getRun(ORG, run.id);
    expect(final?.ledger.map((e) => `${e.stepKey}:${e.outcome}`).join(",")).toContain("n1:succeeded");
  });

  it("branches on trigger data (then/else/next)", async () => {
    const h = harness();
    const cond = {
      key: "c1",
      type: "condition" as const,
      title: "Big?",
      config: { if: { field: "trigger.count", op: "gt", value: 10 }, then: "big", else: "small" },
    };
    const { wf, version } = await makeWorkflow(h, [cond, notifyStep("big"), notifyStep("small"), endStep()]);
    const hi = await makeRun(h, wf.id, version.version, "hi", { count: 12 });
    await driveRun(h.deps, ORG, hi.id, ACTOR);
    const hiFinal = await h.deps.store.getRun(ORG, hi.id);
    expect(hiFinal?.ledger.map((e) => e.stepKey)).toEqual(expect.arrayContaining(["c1", "big", "small", "done"]));
    // then-jump lands on big; flow continues through small (no merge primitive in v1).
    expect(hiFinal?.status).toBe("succeeded");
  });

  it("duplicate drives never duplicate effects (terminal + contention)", async () => {
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [notifyStep("n1"), endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    await driveRun(h.deps, ORG, run.id, ACTOR);
    const again = await driveRun(h.deps, ORG, run.id, ACTOR);
    expect(again).toMatchObject({ outcome: "not-drivable", status: "succeeded" });
    expect(h.notifications.filter((n) => n.userId === MEMBER2)).toHaveLength(1);

    const racy = await makeRun(h, wf.id, version.version, "race");
    const [first, second] = await Promise.all([
      driveRun(h.deps, ORG, racy.id, ACTOR),
      driveRun(h.deps, ORG, racy.id, ACTOR),
    ]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["contended", "succeeded"]);
    expect(h.notifications.filter((n) => n.userId === MEMBER2)).toHaveLength(2);
  });
});

describe("approval steps", () => {
  it("waits, then approved resumes to succeeded; deny fails the run", async () => {
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [approvalStep("a1"), notifyStep("n1"), endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "waiting" });
    const pending = await h.deps.store.findPendingApproval(ORG, run.id, "a1");
    expect(pending?.status).toBe("pending");

    const approved = await applyApprovalDecision(h.deps, ORG, pending!.id, APPROVER, "approved");
    expect(approved.outcome).toMatchObject({ outcome: "succeeded" });
    expect(approved.run.status).toBe("succeeded");
    expect((await h.deps.store.getApproval(ORG, pending!.id))?.status).toBe("approved");
    expect(h.notifications).toContainEqual({ userId: MEMBER2, title: "Hello" });

    const run2 = await makeRun(h, wf.id, version.version, "k2");
    await driveRun(h.deps, ORG, run2.id, ACTOR);
    const pending2 = await h.deps.store.findPendingApproval(ORG, run2.id, "a1");
    const denied = await applyApprovalDecision(h.deps, ORG, pending2!.id, APPROVER, "rejected");
    expect(denied.outcome).toMatchObject({ outcome: "denied" });
    expect(denied.run.status).toBe("failed");
    expect(denied.run.errorCode).toBe("PERMANENT_ERROR");
  });

  it("decides exactly once and notifies explicit approvers best-effort", async () => {
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [approvalStep("a1", [MEMBER2, "99999999-9999-4999-8999-999999999999"]), endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    await driveRun(h.deps, ORG, run.id, ACTOR);
    // Only the verified member is notified; the stranger is skipped, not fatal.
    expect(h.notifications.filter((n) => n.title.startsWith("Approval requested"))).toEqual([{ userId: MEMBER2, title: "Approval requested: Please approve" }]);
    const pending = await h.deps.store.findPendingApproval(ORG, run.id, "a1");
    await applyApprovalDecision(h.deps, ORG, pending!.id, APPROVER, "approved");
    await expect(applyApprovalDecision(h.deps, ORG, pending!.id, APPROVER, "approved")).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });
});

describe("tool_call policy", () => {
  const knowledgeCall = { key: "t1", type: "tool_call" as const, title: "Lookup", config: { tool: "search_knowledge", args: { query: "pto policy" } } };
  it("executes allowlisted reads inline with validated args", async () => {
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [knowledgeCall, endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "succeeded" });
    expect(h.toolCalls).toEqual([{ tool: "search_knowledge", args: { query: "pto policy" } }]);
  });
  it("rejects unknown tools, non-allowlisted tools and invalid args", async () => {
    for (const tool of ["execute_anything", "approve_offboarding", "fetch_expenses"]) {
      const h = harness();
      const { wf, version } = await makeWorkflow(h, [{ key: "t1", type: "tool_call", title: "T", config: { tool, args: {} } }, endStep()]);
      const run = await makeRun(h, wf.id, version.version);
      expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "failed" });
      const final = await h.deps.store.getRun(ORG, run.id);
      expect(final?.errorCode).toBe("VALIDATION_ERROR");
      expect(h.toolCalls).toHaveLength(0);
    }
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [{ ...knowledgeCall, config: { tool: "search_knowledge", args: { query: "x" } } }, endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "failed" });
    expect((await h.deps.store.getRun(ORG, run.id))?.errorCode).toBe("VALIDATION_ERROR");
  });
  it("routes writes through proposal + human claim; failed settlement fails the run", async () => {
    const h = harness();
    const screen = {
      key: "t1",
      type: "tool_call" as const,
      title: "Screen",
      config: { tool: "screen_candidate", args: { candidateId: "22222222-2222-4222-8222-222222222222", role: "Engineer", score: 80, recommendation: "advance" } },
    };
    const { wf, version } = await makeWorkflow(h, [screen, endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "waiting" });
    expect(h.toolCalls).toHaveLength(0);
    expect(h.proposals).toHaveLength(1);
    expect(h.proposals[0]).toMatchObject({ toolName: "screen_candidate", actorId: USER });
    const pending = await h.deps.store.findPendingApproval(ORG, run.id, "t1");
    const decided = await applyApprovalDecision(h.deps, ORG, pending!.id, APPROVER, "approved");
    expect(decided.outcome).toMatchObject({ outcome: "succeeded" });

    // Settlement failure (tool blows up at claim) fails the run honestly.
    const h2 = harness();
    h2.settleResults.set("prop-1", { ok: false, message: "bridge exploded", status: 500 } as never);
    const made = await makeWorkflow(h2, [screen, endStep()]);
    const run2 = await makeRun(h2, made.wf.id, made.version.version);
    await driveRun(h2.deps, ORG, run2.id, ACTOR);
    const pending2 = await h2.deps.store.findPendingApproval(ORG, run2.id, "t1");
    const failed = await applyApprovalDecision(h2.deps, ORG, pending2!.id, APPROVER, "approved");
    expect(failed.outcome).toMatchObject({ outcome: "failed" });
    expect(failed.run.errorCode).toBe("EXTERNAL_SERVICE_ERROR");
  });
});

describe("workflowToolAccess + canDecideApproval", () => {
  it("fails closed on unknown tools and keeps v1 narrow", () => {
    expect(workflowToolAccess("search_knowledge")).toBe("inline");
    expect(workflowToolAccess("get_hr_briefing")).toBe("inline");
    expect(workflowToolAccess("screen_candidate")).toBe("proposal");
    expect(workflowToolAccess("create_survey")).toBe("proposal");
    expect(workflowToolAccess("approve_offboarding")).toBe("denied");
    expect(workflowToolAccess("fetch_expenses")).toBe("denied");
    expect(workflowToolAccess("nope_not_a_tool")).toBe("denied");
  });
  it("lets privileged humans decide; the system actor never can", () => {
    expect(canDecideApproval({ approverUserId: USER, approverRole: "HR_ADMIN", minRole: "HR_ADMIN" })).toBe(true);
    expect(canDecideApproval({ approverUserId: USER, approverRole: "MANAGER", minRole: "MANAGER" })).toBe(true);
    expect(canDecideApproval({ approverUserId: USER, approverRole: "EMPLOYEE", minRole: "MANAGER" })).toBe(false);
    expect(canDecideApproval({ approverUserId: USER, approverRole: "MANAGER", minRole: "HR_ADMIN" })).toBe(false);
    expect(canDecideApproval({ approverUserId: SYSTEM_ACTOR, approverRole: "HR_ADMIN", minRole: "HR_ADMIN" })).toBe(false);
  });
  it("enforces separation of duties: the requester cannot decide their own run", async () => {
    expect(canDecideApproval({ approverUserId: USER, approverRole: "HR_ADMIN", minRole: "HR_ADMIN", requesterUserId: USER })).toBe(false);
    expect(canDecideApproval({ approverUserId: MEMBER2, approverRole: "HR_ADMIN", minRole: "HR_ADMIN", requesterUserId: USER })).toBe(true);
    expect(canDecideApproval({ approverUserId: USER, approverRole: "HR_ADMIN", minRole: "HR_ADMIN", requesterUserId: null })).toBe(true);
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [approvalStep("a1"), endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    await driveRun(h.deps, ORG, run.id, ACTOR);
    const pending = await h.deps.store.findPendingApproval(ORG, run.id, "a1");
    await expect(applyApprovalDecision(h.deps, ORG, pending!.id, ACTOR, "approved")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await h.deps.store.getApproval(ORG, pending!.id))?.status).toBe("pending");
  });
});

describe("retry, cancel, waits, loops", () => {
  function failingTool(message: string, name = "Error") {
    const error = new Error(message);
    error.name = name;
    return error;
  }
  it("retries transient failures with backoff; rejects early/non-retryable/exhausted", async () => {
    const h = harness();
    const call = { key: "t1", type: "tool_call" as const, title: "Lookup", config: { tool: "search_knowledge", args: { query: "pto policy" } } };
    const { wf, version } = await makeWorkflow(h, [call, endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    h.deps.callTool = async () => {
      throw failingTool("socket hang up");
    };
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "failed" });
    const failed = (await h.deps.store.getRun(ORG, run.id))!;
    expect(failed.errorCode).toBe("TRANSIENT_ERROR");
    expect(failed.attempts).toBe(1);
    await expect(retryRun(h.deps, ORG, run.id, ACTOR)).rejects.toMatchObject({ code: "NOT_DUE" });
    h.clock.now = new Date(Date.parse(failed.nextRetryAt!) + 1000);
    h.deps.callTool = async () => ({ ok: true, message: "recovered" });
    expect(await retryRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "succeeded" });

    // Non-retryable validation failure rejects retry.
    const h2 = harness();
    const bad = await makeWorkflow(h2, [{ key: "t1", type: "tool_call", title: "T", config: { tool: "nope", args: {} } }, endStep()]);
    const run2 = await makeRun(h2, bad.wf.id, bad.version.version);
    await driveRun(h2.deps, ORG, run2.id, ACTOR);
    await expect(retryRun(h2.deps, ORG, run2.id, ACTOR)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("exhausts the retry budget honestly", async () => {
    const h = harness();
    const call = { key: "t1", type: "tool_call" as const, title: "Lookup", config: { tool: "search_knowledge", args: { query: "pto policy" } } };
    const { wf, version } = await makeWorkflow(h, [call, endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    h.deps.callTool = async () => {
      throw failingTool("boom", "TimeoutError");
    };
    await driveRun(h.deps, ORG, run.id, ACTOR);
    for (let i = 1; i < 5; i += 1) {
      const current = (await h.deps.store.getRun(ORG, run.id))!;
      h.clock.now = new Date(Date.parse(current.nextRetryAt!) + 1000);
      await retryRun(h.deps, ORG, run.id, ACTOR);
    }
    const exhausted = (await h.deps.store.getRun(ORG, run.id))!;
    expect(exhausted.attempts).toBe(5);
    expect(exhausted.nextRetryAt).toBeNull();
    await expect(retryRun(h.deps, ORG, run.id, ACTOR)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("cancels live runs and refuses terminal ones", async () => {
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [approvalStep("a1"), endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    await driveRun(h.deps, ORG, run.id, ACTOR);
    const cancelled = await cancelRun(h.deps, ORG, run.id, ACTOR);
    expect(cancelled.status).toBe("cancelled");
    await expect(cancelRun(h.deps, ORG, run.id, ACTOR)).rejects.toThrow("Invalid run transition");
  });

  it("parks wait_until runs and resumes when due", async () => {
    const h = harness();
    const wait = { key: "w1", type: "wait_until" as const, title: "Wait", config: { until: "2026-09-10T13:00:00.000Z" } };
    const { wf, version } = await makeWorkflow(h, [wait, notifyStep("n1"), endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "scheduled" });
    await expect(retryRun(h.deps, ORG, run.id, ACTOR)).rejects.toMatchObject({ code: "NOT_DUE" });
    h.clock.now = new Date("2026-09-10T13:00:01.000Z");
    expect(await retryRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "succeeded" });
    expect(h.notifications).toContainEqual({ userId: MEMBER2, title: "Hello" });
  });

  it("terminates cycles: steps are single-fire, revisits skip forward", async () => {
    const h = harness();
    const c1 = {
      key: "c1",
      type: "condition" as const,
      title: "C1",
      config: { if: { field: "trigger.go", op: "eq", value: true }, then: "c2", else: null },
    };
    const c2 = {
      key: "c2",
      type: "condition" as const,
      title: "C2",
      config: { if: { field: "trigger.go", op: "eq", value: true }, then: "c1", else: null },
    };
    const { wf, version } = await makeWorkflow(h, [c1, c2, endStep()]);
    const run = await makeRun(h, wf.id, version.version, "loop", { go: true });
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "succeeded" });
    const final = (await h.deps.store.getRun(ORG, run.id))!;
    // Each step executed exactly once despite the cycle; revisits skipped.
    expect(final.ledger.filter((e) => e.stepKey === "c1" && e.outcome === "succeeded")).toHaveLength(1);
    expect(final.ledger.filter((e) => e.stepKey === "c2" && e.outcome === "succeeded")).toHaveLength(1);
    expect(final.ledger.length).toBeLessThanOrEqual(10);
  });
});

describe("isolation, membership, versioning", () => {
  it("cannot drive another tenant's run", async () => {
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    await expect(driveRun(h.deps, "org-2", run.id, ACTOR)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelRun(h.deps, "org-2", run.id, ACTOR)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("refuses to notify non-members (strict, explicit)", async () => {
    const h = harness();
    const { wf, version } = await makeWorkflow(h, [notifyStep("n1", [MEMBER2, "99999999-9999-4999-8999-999999999999"]), endStep()]);
    const run = await makeRun(h, wf.id, version.version);
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "failed" });
    expect((await h.deps.store.getRun(ORG, run.id))?.errorCode).toBe("VALIDATION_ERROR");
    expect(h.notifications.filter((n) => n.userId === MEMBER2)).toHaveLength(0);
  });
  it("pins the version: later edits never mutate the active run", async () => {
    const h = harness();
    const wf = await h.deps.store.createWorkflow(ORG, { name: "V", triggerType: "manual", status: "active" }, USER);
    await h.deps.store.saveVersion(ORG, wf.id, { steps: [notifyStep("n1", [MEMBER2]), endStep()] as never }, USER);
    const run = await makeRun(h, wf.id, 1);
    await h.deps.store.saveVersion(ORG, wf.id, { steps: [notifyStep("n1", [USER]), endStep()] as never }, USER);
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "succeeded" });
    expect(h.notifications).toContainEqual({ userId: MEMBER2, title: "Hello" });
    expect(h.notifications.filter((n) => n.userId === USER && n.title === "Hello")).toHaveLength(0);
  });
  it("fails honestly without an executable version", async () => {
    const h = harness();
    const wf = await h.deps.store.createWorkflow(ORG, { name: "Legacy", triggerType: "manual", status: "active" }, USER);
    const { run } = await h.deps.store.createRun({
      organizationId: ORG,
      workflowId: wf.id,
      workflowVersion: null,
      idempotencyKey: "legacy-1",
      triggerPayload: {},
      initiatedBy: USER,
    });
    expect(await driveRun(h.deps, ORG, run.id, ACTOR)).toMatchObject({ outcome: "failed" });
    expect((await h.deps.store.getRun(ORG, run.id))?.errorCode).toBe("PERMANENT_ERROR");
  });
});

describe("drive errors", () => {
  it("maps missing runs to NOT_FOUND", async () => {
    const h = harness();
    await expect(driveRun(h.deps, ORG, "missing", ACTOR)).rejects.toBeInstanceOf(WorkflowDriveError);
  });
});
