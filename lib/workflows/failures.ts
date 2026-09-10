/**
 * Phase F failure classification + bounded retry policy — pure, unit-tested.
 *
 * Codes (brief §17): VALIDATION_ERROR, AUTHORIZATION_ERROR, TRANSIENT_ERROR,
 * EXTERNAL_SERVICE_ERROR, PERMANENT_ERROR, SYSTEM_ERROR.
 *
 * Only TRANSIENT_ERROR and EXTERNAL_SERVICE_ERROR are retryable, at most
 * MAX_ATTEMPTS total attempts, with exponential backoff (base × 2^(n-1),
 * capped). Everything else fails the run terminally. Classification is
 * conservative: unknown errors are SYSTEM_ERROR (non-retryable) so a bug
 * can never spin a runaway retry loop.
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHORIZATION_ERROR",
  "TRANSIENT_ERROR",
  "EXTERNAL_SERVICE_ERROR",
  "PERMANENT_ERROR",
  "SYSTEM_ERROR",
] as const;

export type WorkflowErrorCode = (typeof ERROR_CODES)[number];

export const MAX_ATTEMPTS = 5;
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_CAP_MS = 30 * 60_000;

const RETRYABLE: ReadonlySet<WorkflowErrorCode> = new Set(["TRANSIENT_ERROR", "EXTERNAL_SERVICE_ERROR"]);

export function isRetryable(code: WorkflowErrorCode): boolean {
  return RETRYABLE.has(code);
}

/** Backoff before attempt `nextAttempt` (1-based count of the upcoming try). */
export function backoffMs(nextAttempt: number): number {
  const attempt = Math.max(1, Math.trunc(nextAttempt));
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
}

export function nextRetryAt(from: Date, nextAttempt: number): string {
  return new Date(from.getTime() + backoffMs(nextAttempt)).toISOString();
}

/**
 * Classifies a thrown/returned failure. Validation and authorization
 * failures are recognized by marker codes/names first (fail closed), then
 * network/timeout signals, then HTTP semantics; anything else is a
 * non-retryable SYSTEM_ERROR.
 */
export function classifyFailure(error: unknown): WorkflowErrorCode {
  const code = (
    typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : ""
  ).toUpperCase();
  if (code === "INVALID_TRANSITION" || code === "INVALID_KEY_INPUT" || code === "VALIDATION_ERROR") return "VALIDATION_ERROR";
  if (code === "FORBIDDEN" || code === "RBAC_FORBIDDEN" || code === "UNAUTHORIZED" || code === "42501") {
    return "AUTHORIZATION_ERROR";
  }
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (name === "TimeoutError" || name === "AbortError" || /timed out|timeout|ECONNRESET|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(message)) {
    return "TRANSIENT_ERROR";
  }
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : NaN;
  if (Number.isInteger(status)) {
    if (status === 401 || status === 403) return "AUTHORIZATION_ERROR";
    if (status === 409) return "PERMANENT_ERROR";
    if (status === 400 || status === 422) return "VALIDATION_ERROR";
    if (status === 429 || status >= 500) return "EXTERNAL_SERVICE_ERROR";
  }
  if (/not found|does not exist|foreign key|unique constraint|already decided|already exists/i.test(message)) {
    return "PERMANENT_ERROR";
  }
  return "SYSTEM_ERROR";
}
