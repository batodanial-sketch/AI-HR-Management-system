import { createHash } from "node:crypto";

/**
 * Phase F idempotency keys — pure, deterministic, unit-tested.
 *
 * One canonical scheme (extends the `taskIdempotencyKey` precedent from
 * lib/workflow-engine.ts to runs, steps and webhook deliveries):
 *
 *   run:    sha256("wf-run"    | org | workflow | version | idempotency-input)
 *   step:   sha256("wf-step"   | org | run | stepKey | attempt)
 *   webhook: sha256("wf-hook"  | org | event | delivery-id-or-body-hash)
 *
 * Keys are content hashes (fixed length, no PII at rest beyond what the
 * caller already owns). Runs upsert on (organization_id, idempotency_key);
 * the caller supplies a stable `idempotency-input` (client key, schedule
 * slot, or event id) and retries safely collapse onto the existing row.
 */

function hash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Normalizes one key segment (rejects empties and separator smuggling). */
function segment(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 400) {
    throw new WorkflowKeyError(`${label} must be a non-empty string under 400 chars.`);
  }
  if (value.includes("|")) {
    throw new WorkflowKeyError(`${label} must not contain '|'.`);
  }
  return value;
}

export function runIdempotencyKey(input: {
  organizationId: string;
  workflowId: string;
  /** Workflow version the run pins (null = unversioned legacy definition). */
  workflowVersion: number | null;
  /** Stable caller input: client key, cron slot, or webhook delivery id. */
  stableInput: string;
}): string {
  return hash([
    "wf-run",
    segment(input.organizationId, "organizationId"),
    segment(input.workflowId, "workflowId"),
    input.workflowVersion === null ? "unversioned" : String(Math.trunc(input.workflowVersion)),
    segment(input.stableInput, "stableInput"),
  ]);
}

export function stepExecutionKey(input: {
  organizationId: string;
  runId: string;
  stepKey: string;
  attempt: number;
}): string {
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new WorkflowKeyError("attempt must be a positive integer.");
  }
  return hash([
    "wf-step",
    segment(input.organizationId, "organizationId"),
    segment(input.runId, "runId"),
    segment(input.stepKey, "stepKey"),
    String(input.attempt),
  ]);
}

export function webhookDeliveryKey(input: {
  organizationId: string;
  event: string;
  /** Provider delivery id when present, else sha of the raw body. */
  deliveryFingerprint: string;
}): string {
  return hash([
    "wf-hook",
    segment(input.organizationId, "organizationId"),
    segment(input.event, "event"),
    segment(input.deliveryFingerprint, "deliveryFingerprint"),
  ]);
}

export class WorkflowKeyError extends Error {
  readonly code = "INVALID_KEY_INPUT";
  constructor(message: string) {
    super(message);
    this.name = "WorkflowKeyError";
  }
}
