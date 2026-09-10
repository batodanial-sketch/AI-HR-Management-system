import "server-only";

import { roleAtLeast, type RbRole } from "@/lib/authz/model";
import { categoryForTool, requiresConfirmation } from "@/lib/agents/taxonomy";
import { findCopilotTool, validateToolArguments } from "@/lib/copilot/tools";
import { assertRunTransition, type RunStatus, type StepLedgerEntry } from "./machine";
import { MAX_ATTEMPTS, classifyFailure, isRetryable, nextRetryAt, type WorkflowErrorCode } from "./failures";
import { stepExecutionKey } from "./idempotency";
import {
  MAX_STEP_VISITS_PER_RUN,
  evaluateCondition,
  workflowStepsSchema,
  type RunContext,
  type WorkflowStepDefinition,
} from "./steps";
import type { WorkflowRun, WorkflowStore } from "./store";

/**
 * Phase F deterministic run executor — the ONLY component that advances
 * Phase F runs. No model calls, no outbound webhooks, no generic writes:
 *
 *   - `condition`  pure predicate over the run context (allowlisted paths)
 *   - `notify`     member-verified in-app notifications (explicit targets)
 *   - `approval`   durable approval row → run waits → human decides in UI
 *   - `tool_call`  allowlisted copilot tools: READ/ANALYZE inline,
 *                  WRITE/CONSEQUENT via server-side proposal + human claim.
 *                  The executor NEVER claims a proposal.
 *   - `wait_until` park until a timestamp (operator-driven resume in v1)
 *   - `end`        explicit terminal marker
 *
 * All side-effecting seams (notify, audit, tool calls, proposals) are
 * injected via `DriveDeps`: unit tests drive the memory store with
 * recorders; production routes inject the canonical implementations.
 * Every state change goes through one guarded store write (ledger append +
 * status advance atomically), so concurrent drivers cannot corrupt a run —
 * exactly one wins, the loser stops with `contended`.
 */

/** Actor id recorded when a run was initiated by the system, not a user. */
export const SYSTEM_ACTOR = "system:workflow-engine";

/**
 * Workflow tool policy (v1, intentionally narrow). Tool_calls may ONLY use
 * these tools; everything else — including unknown names, which the
 * taxonomy fails closed to CONSEQUENT — is rejected with VALIDATION_ERROR.
 * Writes always take the proposal path; inline execution is reads only.
 */
const WORKFLOW_INLINE_TOOLS: ReadonlySet<string> = new Set([
  "get_workforce_insights",
  "get_hr_briefing",
  "search_knowledge",
  "search_candidates",
  "fetch_team_capacity",
  "fetch_documents",
  "fetch_workflows",
  "fetch_workflow_runs",
  "fetch_workflow_approvals",
]);
const WORKFLOW_PROPOSAL_TOOLS: ReadonlySet<string> = new Set(["screen_candidate", "create_survey", "start_workflow_run"]);

export type WorkflowToolAccess = "inline" | "proposal" | "denied";

export function workflowToolAccess(toolName: string): WorkflowToolAccess {
  const category = categoryForTool(toolName);
  if (!requiresConfirmation(category)) {
    return WORKFLOW_INLINE_TOOLS.has(toolName) ? "inline" : "denied";
  }
  return WORKFLOW_PROPOSAL_TOOLS.has(toolName) ? "proposal" : "denied";
}

export interface DriveActor {
  userId: string;
  role: RbRole;
  organizationId: string;
}

export interface ToolCallResult {
  ok: boolean;
  message: string;
  status?: number;
}

export interface DriveDeps {
  store: WorkflowStore;
  notify: (input: { userId: string; kind: "workflow" | "alert"; title: string; description: string; link?: string }) => Promise<void>;
  audit: (entry: { organizationId: string; actorId: string; action: string; targetId: string; changes: Record<string, unknown> }) => Promise<void>;
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  proposeToolCall: (input: {
    actorId: string;
    organizationId: string;
    role: RbRole;
    toolName: string;
    args: Record<string, unknown>;
    requestId: string;
  }) => Promise<{ proposalId: string }>;
  settleProposal: (input: { proposalId: string; approverUserId: string }) => Promise<ToolCallResult>;
  now?: () => Date;
}

export type DriveOutcome =
  | { outcome: "succeeded" | "failed" | "waiting" | "scheduled" | "contended"; runId: string; visits: number }
  | { outcome: "not-drivable"; runId: string; status: string };

export class WorkflowDriveError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "NOT_DRIVABLE" | "FORBIDDEN" | "VALIDATION" | "ALREADY_DECIDED" | "NOT_DUE" | "CONTESTED",
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "WorkflowDriveError";
  }
}

const nowOf = (deps: DriveDeps): Date => (deps.now ? deps.now() : new Date());

/**
 * Who may decide a workflow approval. The approver must be a real human
 * user (never the system actor — this is the AI-cannot-self-approve
 * circuit breaker) holding at least the step's minimum tier. The
 * approve/deny routes enforce this before the executor touches the row.
 */
export function canDecideApproval(input: {
  approverUserId: string;
  approverRole: RbRole;
  minRole: "HR_ADMIN" | "MANAGER";
  /**
   * Run initiator for separation-of-duties: the requester can never decide
   * their own run's approvals. Null (system-initiated runs) lifts the rule.
   */
  requesterUserId?: string | null;
}): boolean {
  if (input.approverUserId === SYSTEM_ACTOR) return false;
  if (input.requesterUserId && input.approverUserId === input.requesterUserId) return false;
  return roleAtLeast(input.approverRole, input.minRole);
}

function ledgerSucceeded(ledger: StepLedgerEntry[], stepKey: string): boolean {
  // Run-level markers (stepType "(run)": start/retry claims) share the
  // current stepKey but must never satisfy a step — only real step outcomes
  // and "(approval)" satisfactions count. Otherwise a retry would skip the
  // very step it is meant to re-execute.
  return ledger.some((entry) => entry.stepKey === stepKey && entry.outcome === "succeeded" && entry.stepType !== "(run)");
}

function buildContext(run: WorkflowRun): RunContext {
  const steps: Record<string, unknown> = {};
  for (const entry of run.ledger) {
    if (entry.output !== undefined) steps[entry.stepKey] = entry.output;
  }
  return { trigger: run.triggerPayload, steps };
}

async function notifyInitiator(deps: DriveDeps, run: WorkflowRun, kind: "workflow" | "alert", title: string, description: string): Promise<void> {
  if (!run.initiatedBy || run.initiatedBy === SYSTEM_ACTOR) return;
  try {
    await deps.notify({ userId: run.initiatedBy, kind, title, description, link: "/command-center" });
  } catch {
    // Notification delivery never fails a run; the audit trail records it.
  }
}

/** Drives a run until it waits, schedules, terminates, or contends. */
export async function driveRun(deps: DriveDeps, organizationId: string, runId: string, actor: DriveActor): Promise<DriveOutcome> {
  let run = await deps.store.getRun(organizationId, runId);
  if (!run) throw new WorkflowDriveError("NOT_FOUND", "Workflow run was not found.");
  if (!["queued", "running", "retrying"].includes(run.status)) {
    return { outcome: "not-drivable", runId, status: run.status };
  }

  const workflow = await deps.store.getWorkflow(organizationId, run.workflowId);
  if (!workflow) {
    return failDrive(deps, run, "PERMANENT_ERROR", "The workflow definition was deleted; the run cannot continue.");
  }
  const version =
    run.workflowVersion !== null
      ? await deps.store.getVersion(organizationId, run.workflowId, run.workflowVersion)
      : await deps.store.getLatestVersion(organizationId, run.workflowId);
  if (!version) {
    return failDrive(deps, run, "PERMANENT_ERROR", "No executable version exists for this workflow (legacy bridge run).");
  }
  const parsed = workflowStepsSchema.safeParse(version.graph.steps);
  if (!parsed.success) {
    return failDrive(deps, run, "VALIDATION_ERROR", "The pinned workflow version failed step validation.");
  }
  const steps = parsed.data as WorkflowStepDefinition[];
  const byKey = new Map(steps.map((step) => [step.key, step]));
  const orderIndex = new Map(steps.map((step, index) => [step.key, index]));
  const nextInOrder = (key: string): string | null => {
    const index = orderIndex.get(key);
    if (index === undefined || index + 1 >= steps.length) return null;
    return steps[index + 1].key;
  };

  // queued/retrying → running (single guarded write; losers stop).
  if (run.status !== "running") {
    assertRunTransition(run.status as RunStatus, "running");
    const claimed = await deps.store.guardedAdvance(
      organizationId,
      run.id,
      { status: ["queued", "retrying"], currentStep: run.currentStep },
      { stepKey: run.currentStep ?? "(start)", stepType: "(run)", outcome: "succeeded", attempt: run.attempts + 1, at: nowOf(deps).toISOString(), detail: run.status === "queued" ? "run started" : `retry ${run.attempts + 1}` },
      { status: "running", currentStep: run.currentStep ?? steps[0].key },
      run.ledger,
    );
    if (!claimed) return { outcome: "contended", runId, visits: 0 };
    run = claimed;
    if (run.ledger.length === 1) {
      await deps.audit({ organizationId: organizationId, actorId: actor.userId, action: "workflow.run.started", targetId: run.id, changes: { workflowId: run.workflowId, version: run.workflowVersion } });
    }
  }

  let visits = 0;
  for (;;) {
    if (visits >= MAX_STEP_VISITS_PER_RUN) {
      return failDrive(deps, run, "PERMANENT_ERROR", `Step budget exhausted (${MAX_STEP_VISITS_PER_RUN} visits) — possible loop.`);
    }
    visits += 1;
    const key = run.currentStep;
    const step = key ? byKey.get(key) : undefined;
    if (!key || !step) {
      return failDrive(deps, run, "PERMANENT_ERROR", `Unknown step: ${key ?? "(none)"}.`);
    }
    // Idempotent resume: a step that already applied is never re-executed.
    if (ledgerSucceeded(run.ledger, key)) {
      const advanced = await advance(deps, organizationId, run, key, {
        stepKey: key,
        stepType: step.type,
        outcome: "skipped",
        attempt: run.attempts + 1,
        at: nowOf(deps).toISOString(),
        detail: "already applied — skipped on resume",
      }, nextInOrder(key));
      if (!advanced) return { outcome: "contended", runId, visits };
      if (advanced.done) return advanced.done;
      run = advanced.run;
      continue;
    }
    let result: StepResult;
    try {
      result = await executeStep(deps, organizationId, run, step, actor, nextInOrder(key));
    } catch (error) {
      return failDrive(deps, run, classifyFailure(error), error instanceof Error ? error.message : "Step execution failed.");
    }
    if (result.kind === "wait" || result.kind === "scheduled" || result.kind === "terminal") {
      const terminal = await settleStep(deps, organizationId, run, result);
      if (!terminal) return { outcome: "contended", runId, visits };
      return terminal;
    }
    const advanced = await advance(deps, organizationId, run, key, result.entry, result.next);
    if (!advanced) return { outcome: "contended", runId, visits };
    if (advanced.done) return { ...advanced.done, visits };
    run = advanced.run;
  }
}

type StepResult =
  | { kind: "advance"; next: string | null; entry: StepLedgerEntry }
  | { kind: "wait"; entry: StepLedgerEntry }
  | { kind: "scheduled"; entry: StepLedgerEntry; until: string }
  | { kind: "terminal"; entry: StepLedgerEntry; status: "succeeded" | "failed"; errorCode: WorkflowErrorCode | null; note: string };

async function advance(
  deps: DriveDeps,
  organizationId: string,
  run: WorkflowRun,
  key: string,
  entry: StepLedgerEntry,
  next: string | null,
): Promise<{ run: WorkflowRun; done: { outcome: "succeeded"; runId: string; visits: number } | null } | null> {
  if (next === null) {
    const settled = await settleTerminal(deps, organizationId, run, entry, "succeeded", null, `step ${key} completed the flow`);
    if (!settled) return null;
    return { run: settled.run, done: { outcome: "succeeded", runId: run.id, visits: 0 } };
  }
  // Staying in `running` while moving the step pointer is not a status
  // transition — the guarded write pins (running, currentStep) atomically.
  const updated = await deps.store.guardedAdvance(organizationId, run.id, { status: ["running"], currentStep: key }, entry, { status: "running", currentStep: next }, run.ledger);
  if (!updated) return null;
  return { run: updated, done: null };
}

async function settleStep(deps: DriveDeps, organizationId: string, run: WorkflowRun, result: Extract<StepResult, { kind: "wait" | "scheduled" | "terminal" }>): Promise<DriveOutcome | null> {
  if (result.kind === "terminal") {
    const settled = await settleTerminal(deps, organizationId, run, result.entry, result.status, result.errorCode, result.note);
    if (!settled) return null;
    return { outcome: result.status, runId: run.id, visits: 0 };
  }
  const status: RunStatus = result.kind === "wait" ? "waiting_approval" : "scheduled";
  assertRunTransition("running", status);
  const updated = await deps.store.guardedAdvance(
    organizationId,
    run.id,
    { status: ["running"], currentStep: run.currentStep },
    result.entry,
    { status, currentStep: run.currentStep, nextRetryAt: result.kind === "scheduled" ? result.until : null },
    run.ledger,
  );
  if (!updated) return null;
  await deps.audit({ organizationId: run.organizationId,
    actorId: SYSTEM_ACTOR,
    action: result.kind === "wait" ? "workflow.run.waiting_approval" : "workflow.run.scheduled",
    targetId: run.id,
    changes: { step: run.currentStep },
  });
  return { outcome: result.kind === "wait" ? "waiting" : "scheduled", runId: run.id, visits: 0 };
}

async function settleTerminal(
  deps: DriveDeps,
  organizationId: string,
  run: WorkflowRun,
  entry: StepLedgerEntry,
  status: "succeeded" | "failed",
  errorCode: WorkflowErrorCode | null,
  note: string,
): Promise<{ run: WorkflowRun } | null> {
  assertRunTransition(run.status as RunStatus, status);
  const updated = await deps.store.guardedAdvance(
    organizationId,
    run.id,
    { status: ["running", "retrying"], currentStep: run.currentStep },
    entry,
    { status, currentStep: run.currentStep, errorCode, nextRetryAt: null },
    run.ledger,
  );
  if (!updated) return null;
  await deps.audit({ organizationId: run.organizationId, actorId: SYSTEM_ACTOR, action: `workflow.run.${status}`, targetId: run.id, changes: { note, errorCode } });
  await notifyInitiator(
    deps,
    updated,
    status === "succeeded" ? "workflow" : "alert",
    status === "succeeded" ? "Workflow completed" : "Workflow failed",
    note,
  );
  return { run: updated };
}

async function failDrive(deps: DriveDeps, run: WorkflowRun, errorCode: WorkflowErrorCode, message: string): Promise<DriveOutcome> {
  const attempts = run.attempts + 1;
  const retryable = isRetryable(errorCode) && attempts < MAX_ATTEMPTS;
  const entry: StepLedgerEntry = {
    stepKey: run.currentStep ?? "(start)",
    stepType: "(run)",
    outcome: "failed",
    attempt: attempts,
    at: nowOf(deps).toISOString(),
    errorCode,
    detail: message.slice(0, 500),
  };
  // Runs that never started (definition problems) still move queued → failed.
  try {
    assertRunTransition(run.status as RunStatus, "failed");
  } catch {
    return { outcome: "not-drivable", runId: run.id, status: run.status };
  }
  const updated = await deps.store.guardedAdvance(
    run.organizationId,
    run.id,
    { status: ["queued", "running", "retrying"], currentStep: run.currentStep },
    entry,
    { status: "failed", currentStep: run.currentStep, attempts, errorCode, nextRetryAt: retryable ? nextRetryAt(nowOf(deps), attempts + 1) : null },
    run.ledger,
  );
  if (!updated) return { outcome: "contended", runId: run.id, visits: 0 };
  await deps.audit({ organizationId: run.organizationId, actorId: SYSTEM_ACTOR, action: "workflow.run.failed", targetId: run.id, changes: { errorCode, attempts, retryable } });
  await notifyInitiator(deps, updated, "alert", "Workflow failed", `${message} ${retryable ? "It can be retried." : "It needs operator attention."}`.slice(0, 300));
  return { outcome: "failed", runId: run.id, visits: 0 };
}

async function executeStep(
  deps: DriveDeps,
  organizationId: string,
  run: WorkflowRun,
  step: WorkflowStepDefinition,
  actor: DriveActor,
  nextDefault: string | null,
): Promise<StepResult> {
  const at = nowOf(deps).toISOString();
  const attempt = run.attempts + 1;
  switch (step.type) {
    case "condition": {
      const config = step.config as unknown as { if: { field: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in" | "empty"; value?: unknown }; then: string | null; else: string | null };
      const result = evaluateCondition({ field: config.if.field, op: config.if.op, value: config.if.value }, buildContext(run));
      const next = (result ? config.then : config.else) ?? nextDefault;
      return {
        kind: "advance",
        next,
        entry: { stepKey: step.key, stepType: step.type, outcome: "succeeded", attempt, at, detail: `condition ${result ? "true" : "false"} → ${next ?? "(end)"}`, output: { ok: true, result } },
      };
    }
    case "notify": {
      const config = step.config as unknown as { userIds: string[]; title: string; body: string; link?: string };
      let verified: string[];
      try {
        verified = await deps.store.verifyMembers(organizationId, config.userIds);
      } catch {
        throw Object.assign(new Error("Membership verification unavailable."), { code: "TRANSIENT_ERROR" });
      }
      if (verified.length !== [...new Set(config.userIds)].length) {
        throw Object.assign(new Error("One or more notification targets are not organization members."), { code: "VALIDATION_ERROR" });
      }
      for (const userId of verified) {
        await deps.notify({ userId, kind: "workflow", title: config.title, description: config.body, link: config.link });
      }
      return {
        kind: "advance",
        next: nextDefault,
        entry: { stepKey: step.key, stepType: step.type, outcome: "succeeded", attempt, at, detail: `notified ${verified.length} member${verified.length === 1 ? "" : "s"}`, output: { ok: true, message: `delivered: ${verified.length}` } },
      };
    }
    case "approval": {
      const config = step.config as unknown as {
        title: string;
        reason: string;
        approverMinRole: "HR_ADMIN" | "MANAGER";
        notifyUserIds: string[];
        context: Record<string, unknown>;
      };
      const existing = await deps.store.findPendingApproval(organizationId, run.id, step.key);
      const approval =
        existing ??
        (await deps.store.createApproval(organizationId, run.id, step.key, {
          title: config.title,
          reason: config.reason,
          approverMinRole: config.approverMinRole,
          context: config.context,
        }));
      if (!existing && config.notifyUserIds.length > 0) {
        const verified = await deps.store.verifyMembers(organizationId, config.notifyUserIds);
        for (const userId of verified) {
          await deps.notify({ userId, kind: "alert", title: `Approval requested: ${config.title}`, description: config.reason.slice(0, 300), link: "/approvals" });
        }
      }
      await deps.audit({ organizationId: organizationId, actorId: actor.userId, action: "workflow.approval.requested", targetId: run.id, changes: { step: step.key, approvalId: approval.id } });
      return {
        kind: "wait",
        entry: { stepKey: step.key, stepType: step.type, outcome: "waiting", attempt, at, detail: JSON.stringify({ approvalId: approval.id }) },
      };
    }
    case "tool_call": {
      const config = step.config as unknown as { tool: string; args: Record<string, unknown> };
      const access = workflowToolAccess(config.tool);
      if (access === "denied") {
        throw Object.assign(new Error(`Tool '${config.tool}' is not permitted in workflows.`), { code: "VALIDATION_ERROR" });
      }
      const definition = findCopilotTool(config.tool);
      if (!definition) {
        throw Object.assign(new Error(`Unknown tool '${config.tool}'.`), { code: "VALIDATION_ERROR" });
      }
      const validated = validateToolArguments(definition, config.args ?? {});
      if (!validated.ok) {
        throw Object.assign(new Error(`Invalid tool arguments: ${validated.error}`), { code: "VALIDATION_ERROR" });
      }
      if (access === "inline") {
        const result = await deps.callTool(config.tool, validated.args);
        if (!result.ok) {
          throw Object.assign(new Error(result.message || "Tool call failed."), { status: result.status ?? 500 });
        }
        return {
          kind: "advance",
          next: nextDefault,
          entry: { stepKey: step.key, stepType: step.type, outcome: "succeeded", attempt, at, detail: result.message.slice(0, 300), output: { ok: true, message: result.message.slice(0, 300) } },
        };
      }
      const existing = await deps.store.findPendingApproval(organizationId, run.id, step.key);
      if (existing) {
        return { kind: "wait", entry: { stepKey: step.key, stepType: step.type, outcome: "waiting", attempt, at, detail: JSON.stringify({ approvalId: existing.id }) } };
      }
      const { proposalId } = await deps.proposeToolCall({
        actorId: run.initiatedBy ?? SYSTEM_ACTOR,
        organizationId,
        role: actor.role,
        toolName: config.tool,
        args: validated.args,
        requestId: stepExecutionKey({ organizationId, runId: run.id, stepKey: step.key, attempt }),
      });
      const approval = await deps.store.createApproval(organizationId, run.id, step.key, {
        title: `Approve tool call: ${config.tool}`,
        reason: `The workflow reached a write step. Arguments were validated and frozen in proposal ${proposalId}.`,
        approverMinRole: "HR_ADMIN",
        context: { tool: config.tool, args: validated.args, proposalId },
      });
      await deps.audit({ organizationId: organizationId, actorId: actor.userId, action: "workflow.approval.requested", targetId: run.id, changes: { step: step.key, approvalId: approval.id, proposalId, tool: config.tool } });
      return {
        kind: "wait",
        entry: { stepKey: step.key, stepType: step.type, outcome: "waiting", attempt, at, detail: JSON.stringify({ approvalId: approval.id, proposalId }) },
      };
    }
    case "wait_until": {
      const config = step.config as unknown as { until: string };
      const untilMs = Date.parse(config.until);
      if (Number.isNaN(untilMs)) {
        throw Object.assign(new Error("Invalid wait_until timestamp."), { code: "VALIDATION_ERROR" });
      }
      if (untilMs <= nowOf(deps).getTime()) {
        return {
          kind: "advance",
          next: nextDefault,
          entry: { stepKey: step.key, stepType: step.type, outcome: "succeeded", attempt, at, detail: "wait elapsed — resumed", output: { ok: true } },
        };
      }
      return {
        kind: "scheduled",
        until: new Date(untilMs).toISOString(),
        entry: { stepKey: step.key, stepType: step.type, outcome: "waiting", attempt, at, detail: `parked until ${config.until}` },
      };
    }
    case "end": {
      const config = step.config as unknown as { status: "succeeded" | "failed"; note: string };
      if (config.status === "failed") {
        return { kind: "terminal", status: "failed", errorCode: "PERMANENT_ERROR", note: config.note || `step ${step.key} ended the run as failed`, entry: { stepKey: step.key, stepType: step.type, outcome: "failed", attempt, at, errorCode: "PERMANENT_ERROR", detail: config.note.slice(0, 300) } };
      }
      return { kind: "terminal", status: "succeeded", errorCode: null, note: config.note || "workflow completed", entry: { stepKey: step.key, stepType: step.type, outcome: "succeeded", attempt, at, detail: config.note.slice(0, 300) || "completed", output: { ok: true } } };
    }
  }
}

/** Cancels a live run (guarded; terminal runs reject). */
export async function cancelRun(deps: DriveDeps, organizationId: string, runId: string, actor: DriveActor): Promise<WorkflowRun> {
  const run = await deps.store.getRun(organizationId, runId);
  if (!run) throw new WorkflowDriveError("NOT_FOUND", "Workflow run was not found.");
  assertRunTransitionSafe(run.status, "cancelled");
  const updated = await deps.store.guardedAdvance(
    organizationId,
    run.id,
    { status: ["queued", "running", "waiting_approval", "scheduled", "failed", "retrying"], currentStep: run.currentStep },
    { stepKey: run.currentStep ?? "(start)", stepType: "(run)", outcome: "skipped", attempt: run.attempts + 1, at: nowOf(deps).toISOString(), detail: `cancelled by ${actor.userId}` },
    { status: "cancelled", currentStep: run.currentStep, nextRetryAt: null },
    run.ledger,
  );
  if (!updated) throw new WorkflowDriveError("CONTESTED", "The run moved while cancelling; re-read its state.");
  await deps.audit({ organizationId: organizationId, actorId: actor.userId, action: "workflow.run.cancelled", targetId: run.id, changes: { from: run.status } });
  await notifyInitiator(deps, updated, "workflow", "Workflow cancelled", `Run of workflow ${run.workflowId} was cancelled.`);
  return updated;
}

/** Retries a failed (retryable, due) or scheduled (due) run. */
export async function retryRun(deps: DriveDeps, organizationId: string, runId: string, actor: DriveActor): Promise<DriveOutcome> {
  const run = await deps.store.getRun(organizationId, runId);
  if (!run) throw new WorkflowDriveError("NOT_FOUND", "Workflow run was not found.");
  const nowMs = nowOf(deps).getTime();
  if (run.status === "scheduled" || run.status === "failed") {
    const dueAt = run.nextRetryAt ? Date.parse(run.nextRetryAt) : NaN;
    if (!Number.isNaN(dueAt) && dueAt > nowMs) {
      throw new WorkflowDriveError("NOT_DUE", `The run is not due until ${run.nextRetryAt}.`, dueAt - nowMs);
    }
  }
  if (run.status === "failed") {
    const code = (run.errorCode ?? "SYSTEM_ERROR") as WorkflowErrorCode;
    if (!isRetryable(code)) {
      throw new WorkflowDriveError("VALIDATION", `This failure (${run.errorCode ?? "unknown"}) is not retryable.`);
    }
    if (run.attempts >= MAX_ATTEMPTS) {
      throw new WorkflowDriveError("VALIDATION", `Retry budget exhausted (${MAX_ATTEMPTS} attempts).`);
    }
  } else if (run.status !== "scheduled") {
    throw new WorkflowDriveError("NOT_DRIVABLE", `Only failed or scheduled runs can be retried (status: ${run.status}).`);
  }
  assertRunTransitionSafe(run.status, "retrying");
  const claimed = await deps.store.guardedAdvance(
    organizationId,
    run.id,
    { status: [run.status], currentStep: run.currentStep },
    { stepKey: run.currentStep ?? "(start)", stepType: "(run)", outcome: "waiting", attempt: run.attempts + 1, at: nowOf(deps).toISOString(), detail: `retry claimed by ${actor.userId}` },
    { status: "retrying", currentStep: run.currentStep, nextRetryAt: null, errorCode: null },
    run.ledger,
  );
  if (!claimed) throw new WorkflowDriveError("CONTESTED", "Another retry won the race; re-read the run.");
  await deps.audit({ organizationId: organizationId, actorId: actor.userId, action: "workflow.run.retry", targetId: run.id, changes: { from: run.status } });
  return driveRun(deps, organizationId, runId, actor);
}

/**
 * Applies an approval decision: owns the approve/reject row transition, the
 * linked proposal settlement (tool_call steps), and run resume/fail.
 * Routes authenticate + authorize (canDecideApproval) before calling this.
 */
export async function applyApprovalDecision(
  deps: DriveDeps,
  organizationId: string,
  approvalId: string,
  approver: DriveActor,
  decision: "approved" | "rejected",
): Promise<{ run: WorkflowRun; outcome: DriveOutcome | { outcome: "denied"; runId: string } }> {
  const approval = await deps.store.getApproval(organizationId, approvalId);
  if (!approval) throw new WorkflowDriveError("NOT_FOUND", "Approval was not found.");
  if (approval.status !== "pending") throw new WorkflowDriveError("ALREADY_DECIDED", `The approval is already ${approval.status}.`);
  const run = await deps.store.getRun(organizationId, approval.runId);
  if (!run) throw new WorkflowDriveError("NOT_FOUND", "The approval's run was not found.");
  if (run.status !== "waiting_approval" || run.currentStep !== approval.stepKey) {
    throw new WorkflowDriveError("NOT_DRIVABLE", `The run is no longer waiting on this step (status: ${run.status}).`);
  }
  if (run.initiatedBy && run.initiatedBy === approver.userId) {
    throw new WorkflowDriveError("FORBIDDEN", "Separation of duties: the run initiator cannot decide their own approval.");
  }
  const decided = await deps.store.decideApproval(organizationId, approvalId, { status: decision, approverUserId: approver.userId });
  if (!decided) throw new WorkflowDriveError("ALREADY_DECIDED", "The approval was already decided.");
  await deps.audit({ organizationId: organizationId,
    actorId: approver.userId,
    action: `workflow.approval.${decision}`,
    targetId: run.id,
    changes: { approvalId, step: approval.stepKey, initiatedBy: run.initiatedBy },
  });

  if (decision === "rejected") {
    assertRunTransitionSafe(run.status, "failed");
    const updated = await deps.store.guardedAdvance(
      organizationId,
      run.id,
      { status: ["waiting_approval"], currentStep: run.currentStep },
      { stepKey: approval.stepKey, stepType: "(approval)", outcome: "failed", attempt: run.attempts + 1, at: nowOf(deps).toISOString(), errorCode: "PERMANENT_ERROR", detail: `denied by ${approver.userId}` },
      { status: "failed", currentStep: run.currentStep, errorCode: "PERMANENT_ERROR", nextRetryAt: null },
      run.ledger,
    );
    if (!updated) throw new WorkflowDriveError("CONTESTED", "The run moved while deciding; re-read its state.");
    await deps.audit({ organizationId: organizationId, actorId: SYSTEM_ACTOR, action: "workflow.run.failed", targetId: run.id, changes: { reason: "approval denied" } });
    await notifyInitiator(deps, updated, "alert", "Workflow stopped: approval denied", `Step '${approval.stepKey}' was denied.`);
    return { run: updated, outcome: { outcome: "denied", runId: run.id } };
  }

  // Approved: settle the linked proposal for tool_call steps, then resume.
  const waitingEntry = [...run.ledger].reverse().find((entry) => entry.stepKey === approval.stepKey && entry.outcome === "waiting");
  let link: { proposalId?: string } = {};
  try {
    link = JSON.parse(waitingEntry?.detail ?? "{}") as { proposalId?: string };
  } catch {
    link = {};
  }
  if (link.proposalId) {
    const settled = await deps.settleProposal({ proposalId: link.proposalId, approverUserId: approver.userId });
    if (!settled.ok) {
      // The human approved but the tool failed: waiting_approval → failed
      // directly (guarded; the waiting entry stays in the ledger as history).
      assertRunTransitionSafe("waiting_approval", "failed");
      const code = classifyFailure(Object.assign(new Error(settled.message), { status: settled.status ?? 500 }));
      const failed = await deps.store.guardedAdvance(
        organizationId,
        run.id,
        { status: ["waiting_approval"], currentStep: run.currentStep },
        { stepKey: approval.stepKey, stepType: "(approval)", outcome: "failed", attempt: run.attempts + 1, at: nowOf(deps).toISOString(), errorCode: code, detail: settled.message.slice(0, 300) },
        { status: "failed", currentStep: run.currentStep, attempts: run.attempts + 1, errorCode: code, nextRetryAt: null },
        run.ledger,
      );
      if (!failed) throw new WorkflowDriveError("CONTESTED", "The run moved while deciding; re-read its state.");
      await deps.audit({ organizationId: organizationId, actorId: SYSTEM_ACTOR, action: "workflow.run.failed", targetId: run.id, changes: { reason: "approved tool call failed", errorCode: code } });
      await notifyInitiator(deps, failed, "alert", "Workflow failed", settled.message.slice(0, 300));
      return { run: failed, outcome: { outcome: "failed", runId: run.id, visits: 0 } };
    }
  }
  assertRunTransitionSafe("waiting_approval", "running");
  const resumed = await deps.store.guardedAdvance(
    organizationId,
    run.id,
    { status: ["waiting_approval"], currentStep: run.currentStep },
    { stepKey: approval.stepKey, stepType: "(approval)", outcome: "succeeded", attempt: run.attempts + 1, at: nowOf(deps).toISOString(), detail: `approved by ${approver.userId}`, output: { ok: true } },
    { status: "running", currentStep: run.currentStep },
    run.ledger,
  );
  if (!resumed) throw new WorkflowDriveError("CONTESTED", "The run moved while deciding; re-read its state.");
  // The approval step now carries a `succeeded` ledger entry, so the resumed
  // drive skips re-executing it (idempotent resume) and advances past it.
  const outcome = await driveRun(deps, organizationId, run.id, { userId: approver.userId, role: approver.role, organizationId });
  const final = (await deps.store.getRun(organizationId, run.id)) ?? resumed;
  return { run: final, outcome };
}

function assertRunTransitionSafe(from: string, to: RunStatus): void {
  assertRunTransition(from as RunStatus, to);
}
