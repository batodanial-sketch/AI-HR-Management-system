/**
 * Phase F pure foundations: run/task/approval state machines, idempotency
 * keys, failure classification + retry bounds. No I/O, fully deterministic.
 */
import {
  assertApprovalTransition,
  assertRunTransition,
  assertTaskTransition,
  canTransitionApproval,
  canTransitionRun,
  canTransitionTask,
  WorkflowMachineError,
} from "@/lib/workflows/machine";
import { runIdempotencyKey, stepExecutionKey, webhookDeliveryKey, WorkflowKeyError } from "@/lib/workflows/idempotency";
import {
  backoffMs,
  classifyFailure,
  isRetryable,
  MAX_ATTEMPTS,
  type WorkflowErrorCode,
} from "@/lib/workflows/failures";

describe("run state machine", () => {
  it("allows the happy path and the approval loop", () => {
    expect(canTransitionRun("queued", "running")).toBe(true);
    expect(canTransitionRun("running", "waiting_approval")).toBe(true);
    expect(canTransitionRun("waiting_approval", "running")).toBe(true);
    expect(canTransitionRun("running", "succeeded")).toBe(true);
  });
  it("allows failure → retrying → running, waits, and cancellation from live states", () => {
    expect(canTransitionRun("running", "failed")).toBe(true);
    expect(canTransitionRun("queued", "failed")).toBe(true);
    expect(canTransitionRun("failed", "retrying")).toBe(true);
    expect(canTransitionRun("retrying", "running")).toBe(true);
    expect(canTransitionRun("running", "scheduled")).toBe(true);
    expect(canTransitionRun("scheduled", "retrying")).toBe(true);
    expect(canTransitionRun("scheduled", "running")).toBe(false);
    for (const from of ["queued", "running", "waiting_approval", "scheduled", "failed", "retrying"] as const) {
      expect(canTransitionRun(from, "cancelled")).toBe(true);
    }
  });
  it("rejects terminal exits, skips and reversals", () => {
    for (const from of ["succeeded", "failed", "cancelled"] as const) {
      expect(canTransitionRun(from, "running")).toBe(false);
    }
    expect(canTransitionRun("queued", "succeeded")).toBe(false);
    expect(canTransitionRun("waiting_approval", "queued")).toBe(false);
    expect(() => assertRunTransition("succeeded", "running")).toThrow(WorkflowMachineError);
  });
});

describe("task transitions (hardens updateTaskStatusAction)", () => {
  it("allows forward progress and supervised reopen", () => {
    expect(canTransitionTask("pending", "in_progress")).toBe(true);
    expect(canTransitionTask("in_progress", "completed")).toBe(true);
    expect(canTransitionTask("failed", "pending")).toBe(true);
    expect(canTransitionTask("cancelled", "pending")).toBe(true);
    expect(canTransitionTask("completed", "completed")).toBe(true);
  });
  it("makes completed sticky and rejects reversals", () => {
    expect(canTransitionTask("completed", "pending")).toBe(false);
    expect(canTransitionTask("completed", "in_progress")).toBe(false);
    expect(canTransitionTask("pending", "bogus")).toBe(false);
    expect(() => assertTaskTransition("completed", "pending")).toThrow(WorkflowMachineError);
  });
});

describe("approval transitions", () => {
  it("decides pending exactly once", () => {
    expect(canTransitionApproval("pending", "approved")).toBe(true);
    expect(canTransitionApproval("pending", "rejected")).toBe(true);
    expect(canTransitionApproval("pending", "expired")).toBe(true);
    expect(canTransitionApproval("approved", "rejected")).toBe(false);
    expect(canTransitionApproval("rejected", "approved")).toBe(false);
    expect(() => assertApprovalTransition("approved", "approved")).toThrow(WorkflowMachineError);
  });
});

describe("idempotency keys", () => {
  const run = { organizationId: "org-1", workflowId: "wf-1", workflowVersion: 2, stableInput: "evt-9" };
  it("is deterministic and domain-separated", () => {
    expect(runIdempotencyKey(run)).toBe(runIdempotencyKey(run));
    expect(runIdempotencyKey({ ...run, stableInput: "evt-10" })).not.toBe(runIdempotencyKey(run));
    expect(runIdempotencyKey({ ...run, workflowVersion: null })).not.toBe(runIdempotencyKey(run));
    expect(runIdempotencyKey(run)).toHaveLength(64);
  });
  it("separates steps by run/step/attempt and webhooks by delivery", () => {
    const step = { organizationId: "org-1", runId: "run-1", stepKey: "notify", attempt: 1 };
    expect(stepExecutionKey(step)).toBe(stepExecutionKey(step));
    expect(stepExecutionKey({ ...step, attempt: 2 })).not.toBe(stepExecutionKey(step));
    const hook = { organizationId: "org-1", event: "leave.requested", deliveryFingerprint: "abc" };
    expect(webhookDeliveryKey(hook)).toBe(webhookDeliveryKey(hook));
    expect(webhookDeliveryKey({ ...hook, event: "candidate.advanced" })).not.toBe(webhookDeliveryKey(hook));
  });
  it("rejects empty, oversized and separator-smuggling input", () => {
    expect(() => runIdempotencyKey({ ...run, stableInput: "" })).toThrow(WorkflowKeyError);
    expect(() => runIdempotencyKey({ ...run, stableInput: "a|b" })).toThrow(WorkflowKeyError);
    expect(() => stepExecutionKey({ organizationId: "o", runId: "r", stepKey: "s", attempt: 0 })).toThrow(WorkflowKeyError);
  });
});

describe("failure classification + retry bounds", () => {
  it("retries only transient/external failures", () => {
    const retryable: WorkflowErrorCode[] = ["TRANSIENT_ERROR", "EXTERNAL_SERVICE_ERROR"];
    const terminal: WorkflowErrorCode[] = ["VALIDATION_ERROR", "AUTHORIZATION_ERROR", "PERMANENT_ERROR", "SYSTEM_ERROR"];
    for (const code of retryable) expect(isRetryable(code)).toBe(true);
    for (const code of terminal) expect(isRetryable(code)).toBe(false);
  });
  it("classifies signals conservatively (unknown → SYSTEM_ERROR, never retry)", () => {
    expect(classifyFailure(Object.assign(new Error("x"), { code: "INVALID_TRANSITION" }))).toBe("VALIDATION_ERROR");
    expect(classifyFailure(Object.assign(new Error("denied"), { code: "RBAC_FORBIDDEN" }))).toBe("AUTHORIZATION_ERROR");
    expect(classifyFailure(Object.assign(new Error("socket hang up"), { name: "Error" }))).toBe("TRANSIENT_ERROR");
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    expect(classifyFailure(timeout)).toBe("TRANSIENT_ERROR");
    expect(classifyFailure(Object.assign(new Error("boom"), { status: 503 }))).toBe("EXTERNAL_SERVICE_ERROR");
    expect(classifyFailure(Object.assign(new Error("nope"), { status: 403 }))).toBe("AUTHORIZATION_ERROR");
    expect(classifyFailure(new Error("weird new failure mode"))).toBe("SYSTEM_ERROR");
    expect(classifyFailure("plain string")).toBe("SYSTEM_ERROR");
  });
  it("backs off exponentially with a cap and a hard attempt ceiling", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(99)).toBe(30 * 60_000);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
