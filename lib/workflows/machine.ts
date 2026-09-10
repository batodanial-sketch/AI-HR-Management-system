/**
 * Phase F workflow state machines — pure, client-safe, unit-tested.
 *
 * Run lifecycle (enforced server-side by the executor and the run/approval
 * routes; never by UI state):
 *
 *   queued → running → succeeded
 *                ↓
 *         waiting_approval → running   (approval step / WRITE tool proposal)
 *                ↓
 *            scheduled → running        (wait_until; resume when due)
 *                ↓
 *              failed → retrying → running   (bounded: failures.ts)
 *                ↓
 *            cancelled → (terminal; from queued/running/waiting_approval/
 *                         scheduled/failed/retrying)
 *
 * Terminal: succeeded, failed (non-retryable or attempts exhausted),
 * cancelled. `retrying` is a transient marker set by the retry endpoint and
 * immediately re-driven; it exists so two concurrent retries cannot both win
 * (atomic failed→retrying claim, same pattern as lib/scheduler.ts).
 */

export const RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "scheduled",
  "retrying",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  // queued → failed covers runs whose definition is invalid at drive time
  // (deleted workflow, missing version, failed step validation).
  queued: ["running", "failed", "cancelled"],
  running: ["waiting_approval", "scheduled", "succeeded", "failed", "cancelled"],
  waiting_approval: ["running", "failed", "cancelled"],
  scheduled: ["retrying", "failed", "cancelled"],
  retrying: ["running", "failed", "cancelled"],
  succeeded: [],
  failed: ["retrying", "cancelled"],
  cancelled: [],
};

export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === "string" && (RUN_STATUSES as readonly string[]).includes(value);
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new WorkflowMachineError(`Invalid run transition: ${from} → ${to}.`);
  }
}

/** Step ledger entries appended to `workflow_runs.executed_actions` (append-only). */
export const STEP_OUTCOMES = ["succeeded", "failed", "skipped", "waiting"] as const;
export type StepOutcome = (typeof STEP_OUTCOMES)[number];

export interface StepLedgerEntry {
  stepKey: string;
  stepType: string;
  outcome: StepOutcome;
  attempt: number;
  at: string;
  /** Error code from failures.ts when outcome is failed. Never a raw trace. */
  errorCode?: string;
  /** Human-safe detail (no secrets, no PII beyond what the step owned). */
  detail?: string;
  /**
   * Minimal structured output for condition predicates (`steps.<key>.*`):
   * `{ ok, message }` only — full tool payloads are never persisted
   * (PII minimization + row bloat).
   */
  output?: { ok: boolean; message?: string; result?: unknown };
}

/**
 * Daily-task transitions — hardens `updateTaskStatusAction`, which today
 * accepts any → any. Terminal states are sticky; `failed` may return to
 * `pending` for a supervised re-run; `cancelled` may be reopened to pending.
 */
export const TASK_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["in_progress", "completed", "failed", "skipped", "cancelled"],
  in_progress: ["completed", "failed", "skipped", "cancelled", "pending"],
  completed: [],
  failed: ["pending", "cancelled"],
  skipped: ["pending"],
  cancelled: ["pending"],
};

export function canTransitionTask(from: string, to: string): boolean {
  if (from === to) return true;
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTaskTransition(from: string, to: string): void {
  if (!canTransitionTask(from, to)) {
    throw new WorkflowMachineError(`Invalid task transition: ${from} → ${to}.`);
  }
}

/**
 * Approval transitions for `workflow_approvals.status`
 * (pending → approved | rejected | expired; terminal thereafter).
 */
export function canTransitionApproval(from: string, to: string): boolean {
  return from === "pending" && (to === "approved" || to === "rejected" || to === "expired");
}

export function assertApprovalTransition(from: string, to: string): void {
  if (!canTransitionApproval(from, to)) {
    throw new WorkflowMachineError(`Invalid approval transition: ${from} → ${to}.`);
  }
}

export class WorkflowMachineError extends Error {
  readonly code = "INVALID_TRANSITION";
  constructor(message: string) {
    super(message);
    this.name = "WorkflowMachineError";
  }
}
