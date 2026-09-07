/**
 * Pilot safety controls — env-driven, evaluated on every AI request.
 *
 *   AI_KILL_SWITCH=1                → every AI/agent request is refused (503,
 *                                      code AI_DISABLED) before any provider
 *                                      spend; health reports `ai: disabled`.
 *   PILOT_ORG_ALLOWLIST=<uuid,uuid> → only these canonical tenants may use AI
 *                                      and agent endpoints (403 otherwise).
 *                                      Empty = no allowlist (dev/demo only;
 *                                      readiness check flags it in production).
 *   PILOT_MAX_REQUEST_TOKENS=<n>    → hard per-request token estimate ceiling
 *                                      (default 12 000) — bounds a single call.
 *   PILOT_MAX_TOOL_ROUNDS=<n>       → agent loop ceiling (default 3, max 5).
 *
 * All values are read at request time so a redeploy is not required to flip
 * the kill switch on platforms that support live env updates; where the
 * platform requires a redeploy, that is the documented procedure.
 *
 * Pure (no server-only import) so it is unit-testable.
 */

export interface PilotDecision {
  allowed: boolean;
  status: 200 | 403 | 503;
  code: "OK" | "AI_DISABLED" | "ORG_NOT_ALLOWLISTED" | "REQUEST_TOO_LARGE";
  message: string;
}

export function aiKillSwitchOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["1", "true", "on", "yes"].includes((env.AI_KILL_SWITCH ?? "").toLowerCase());
}

export function pilotAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.PILOT_ORG_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s));
}

export function maxRequestTokens(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.PILOT_MAX_REQUEST_TOKENS ?? 12_000);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200_000) : 12_000;
}

export function maxToolRounds(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.PILOT_MAX_TOOL_ROUNDS ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 5) : 3;
}

export function evaluatePilotAccess(
  input: { organizationId: string | null; estimatedTokens?: number },
  env: NodeJS.ProcessEnv = process.env,
): PilotDecision {
  if (aiKillSwitchOn(env)) {
    return { allowed: false, status: 503, code: "AI_DISABLED", message: "AI features are temporarily disabled by the operator." };
  }
  const allowlist = pilotAllowlist(env);
  if (allowlist.length > 0) {
    if (!input.organizationId || !allowlist.includes(input.organizationId.toLowerCase())) {
      return { allowed: false, status: 403, code: "ORG_NOT_ALLOWLISTED", message: "This workspace is not enrolled in the AI pilot." };
    }
  }
  if ((input.estimatedTokens ?? 0) > maxRequestTokens(env)) {
    return { allowed: false, status: 403, code: "REQUEST_TOO_LARGE", message: "Request exceeds the pilot per-request token ceiling." };
  }
  return { allowed: true, status: 200, code: "OK", message: "ok" };
}

/** Production readiness of the pilot configuration (surfaced by /api/system/ready). */
export function pilotConfigFindings(env: NodeJS.ProcessEnv = process.env): string[] {
  const findings: string[] = [];
  const production = (env.APP_ENV ?? env.NODE_ENV) === "production";
  if (production && pilotAllowlist(env).length === 0) findings.push("PILOT_ORG_ALLOWLIST is empty in production.");
  if (production && (env.MALWARE_SCANNER ?? "disabled") === "disabled") findings.push("MALWARE_SCANNER is disabled — document uploads are refused.");
  if (production && (env.STORAGE_PROVIDER ?? "local") !== "supabase") findings.push("STORAGE_PROVIDER is not a production provider.");
  if (production && !env.ERROR_TRACKING_DSN && !env.ERROR_TRACKING_WEBHOOK) findings.push("Error tracking backend is not configured.");
  if (production && (env.METRICS_BACKEND ?? "none") === "none") findings.push("METRICS_BACKEND is not configured.");
  if (production && !env.BRIDGE_SECRET_KEY) findings.push("BRIDGE_SECRET_KEY is not set — bridge fails closed.");
  return findings;
}
