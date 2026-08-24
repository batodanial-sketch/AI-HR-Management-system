import "server-only";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Json } from "@/lib/database.types";

/**
 * Enterprise audit logging — a tamper-evident trail of administrative and
 * security-relevant actions, written to `audit_logs`.
 *
 * The live `audit_logs` table is the legacy-shaped schema reconciled during the
 * DB migration passes:
 *
 *   id, organization_id, actor_id, actor_user_id, action,
 *   entity_type, entity_id, before_state, after_state,
 *   metadata, ip_address, user_agent, created_at
 *
 * IMPORTANT schema note: `audit_logs.action` is a constrained Postgres enum
 * (`audit_action`) with the values { create, read, update, delete, export,
 * login, logout, approve, reject, generate } — NOT free text. The app's rich
 * dotted action labels (e.g. "member.remove") are therefore mapped to the enum
 * verb in `ACTION_TO_VERB`, and the full dotted label is preserved in
 * `metadata.action` so nothing is lost.
 *
 * `entity_type` / `entity_id` are the canonical `resource_type` / `resource_id`
 * (same semantics, historical naming). When Supabase is not configured
 * (demo/local), events fall back to the server log (actor id only — never PII).
 */

export type AuditAction =
  | "employee.create"
  | "employee.update"
  | "employee.offboard"
  | "candidate.create"
  | "candidate.move"
  | "candidate.resume"
  | "leave.request"
  | "leave.resolve"
  | "payroll.execute"
  | "workspace.create"
  | "workspace.update"
  | "member.add"
  | "member.update"
  | "member.remove"
  | "license.activate"
  | "trial.start"
  | "settings.update"
  | "webhook.create"
  | "webhook.delete"
  | "report.export"
  | "api_key.create"
  | "api_key.revoke";

/** Matches a canonical UUID v4 (the `entity_id` column type). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enum verbs accepted by the live `audit_action` type. */
export type AuditVerb =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "export"
  | "login"
  | "logout"
  | "approve"
  | "reject"
  | "generate";

/** Maps each rich dotted action to the constrained enum verb. */
const ACTION_TO_VERB: Record<AuditAction, AuditVerb> = {
  "employee.create": "create",
  "employee.update": "update",
  "employee.offboard": "update",
  "candidate.create": "create",
  "candidate.move": "update",
  "candidate.resume": "update",
  "leave.request": "create",
  "leave.resolve": "update",
  "payroll.execute": "generate",
  "workspace.create": "create",
  "workspace.update": "update",
  "member.add": "create",
  "member.update": "update",
  "member.remove": "delete",
  "license.activate": "update",
  "trial.start": "create",
  "settings.update": "update",
  "webhook.create": "create",
  "webhook.delete": "delete",
  "report.export": "export",
  "api_key.create": "create",
  "api_key.revoke": "delete",
};

/** Modern, resource-oriented audit event contract. */
export interface AuditEvent {
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  /** Client IP (from `x-forwarded-for`) — best-effort, may be null. */
  ipAddress?: string | null;
}

/** Legacy-shaped entry retained for existing `recordAudit` callers. */
export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit event for the current user.
 *
 * This is the canonical writer: it resolves the actor + org, maps the rich
 * dotted action to the enum verb, and inserts a row into `audit_logs` (or logs
 * to stdout in demo mode).
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const user = await getCurrentUser();
  const organizationId = user.organizationId;

  // The live `entity_id` column is UUID-typed, but some resources are keyed by
  // non-UUID strings (e.g. report type "leads"). Only write a UUID into
  // `entity_id`; always preserve the raw identifier in metadata.
  const rawId = event.resourceId ?? null;
  const entityId =
    typeof rawId === "string" && UUID_RE.test(rawId) ? rawId : null;

  // Preserve the full dotted action label + raw resource id in metadata so the
  // fine-grained semantic survives the enum-verb / UUID mapping.
  const metadata = {
    ...(event.metadata ?? {}),
    action: event.action,
    resource_id: rawId,
  } as Record<string, unknown>;

  if (hasSupabaseEnv() && organizationId) {
    const { error } = await serverClient().from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: user.id,
      action: ACTION_TO_VERB[event.action],
      // `resource_type` maps to the legacy `entity_type` column.
      entity_type: event.resourceType,
      entity_id: entityId,
      metadata: metadata as Json,
      ip_address: event.ipAddress ?? null,
    });
    if (error) {
      console.error("[audit] write failed:", error.message);
    }
    return;
  }

  // Demo/offline (or no org): log to stdout so the trail still exists.
  // The actor email is PII — log the user id only.
  console.info(
    `[audit] actor=${user.id} → ${event.action} ${event.resourceType}${
      rawId ? ` (${rawId})` : ""
    }`,
    metadata,
  );
}

/**
 * Legacy alias — delegates to `logAuditEvent` so existing callers share the
 * same canonical writer path.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await logAuditEvent({
    action: entry.action,
    resourceType: entry.entity,
    resourceId: entry.entityId,
    metadata: entry.metadata,
  });
}
