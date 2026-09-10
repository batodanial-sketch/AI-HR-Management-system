import "server-only";

import { getRbacContext, rbacErrorResponse, type RbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/authz/model";
import { WorkflowDriveError } from "./executor";

/**
 * Shared route plumbing for the Phase F workflow REST API.
 *
 * Auth model per endpoint (org identity always from the trusted session):
 *   - list/get workflows + runs: any authenticated member (RLS member-read)
 *   - run / retry / cancel: the run initiator, or HR_ADMIN+ for any run
 *     (system-initiated runs: HR_ADMIN+ only)
 *   - approvals list: MANAGER+ (eligible approvers)
 *   - approve/deny: canDecideApproval (human + step minimum tier)
 *   - save version: HR_ADMIN+ (definition change)
 */

export type RouteActor = { userId: string; organizationId: string; role: RbacContext["role"]; demoMode: boolean };

export async function routeActor(): Promise<RouteActor | Response> {
  try {
    const ctx = await getRbacContext();
    return { userId: ctx.user.id, organizationId: ctx.organizationId, role: ctx.role, demoMode: ctx.demoMode };
  } catch (error) {
    return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
}

export function requireRole(actor: RouteActor, minimum: "HR_ADMIN" | "MANAGER"): Response | null {
  if (!roleAtLeast(actor.role, minimum)) {
    return Response.json(
      { ok: false, error: `RBAC: ${minimum} role required — the ${actor.role} role is not authorized.`, code: "RBAC_FORBIDDEN" },
      { status: 403 },
    );
  }
  return null;
}

/** Initiator-or-privileged rule for cancel/retry. System runs: privileged only. */
export function canManageRun(actor: RouteActor, initiatedBy: string | null): boolean {
  if (roleAtLeast(actor.role, "HR_ADMIN")) return true;
  return initiatedBy !== null && initiatedBy === actor.userId;
}

export function mapDriveError(error: unknown): Response {
  if (error instanceof WorkflowDriveError) {
    switch (error.code) {
      case "NOT_FOUND":
        return Response.json({ ok: false, error: error.message, code: error.code }, { status: 404 });
      case "FORBIDDEN":
        return Response.json({ ok: false, error: error.message, code: error.code }, { status: 403 });
      case "VALIDATION":
        return Response.json({ ok: false, error: error.message, code: error.code }, { status: 400 });
      case "NOT_DRIVABLE":
        return Response.json({ ok: false, error: error.message, code: error.code }, { status: 409 });
      case "ALREADY_DECIDED":
      case "CONTESTED":
        return Response.json({ ok: false, error: error.message, code: error.code }, { status: 409 });
      case "NOT_DUE": {
        const retryAfterSec = Math.max(1, Math.ceil((error.retryAfterMs ?? 60_000) / 1000));
        return Response.json({ ok: false, error: error.message, code: error.code, retryAfterMs: error.retryAfterMs ?? null }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
      }
    }
  }
  if (error instanceof Error && /workflow engine unavailable/i.test(error.message)) {
    return Response.json({ ok: false, error: "Workflow engine unavailable: database is not configured.", code: "ENGINE_UNAVAILABLE" }, { status: 503 });
  }
  return Response.json({ ok: false, error: error instanceof Error ? error.message : "Workflow request failed." }, { status: 500 });
}

/** Parses the approval request envelope stored in `decision_note` (defensive). */
export function parseApprovalRequest(decisionNote: string | null): {
  title: string;
  reason: string;
  approverMinRole: "HR_ADMIN" | "MANAGER";
  context: Record<string, unknown>;
} {
  const fallback = { title: "Approval requested", reason: "(no reason recorded)", approverMinRole: "HR_ADMIN" as const, context: {} };
  if (!decisionNote) return fallback;
  try {
    const parsed = JSON.parse(decisionNote) as { title?: unknown; reason?: unknown; approverMinRole?: unknown; context?: unknown };
    return {
      title: typeof parsed.title === "string" && parsed.title ? parsed.title : fallback.title,
      reason: typeof parsed.reason === "string" && parsed.reason ? parsed.reason : fallback.reason,
      approverMinRole: parsed.approverMinRole === "MANAGER" ? "MANAGER" : "HR_ADMIN",
      context: typeof parsed.context === "object" && parsed.context !== null ? (parsed.context as Record<string, unknown>) : {},
    };
  } catch {
    return fallback;
  }
}
