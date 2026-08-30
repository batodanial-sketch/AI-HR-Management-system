import "server-only";

import { headers } from "next/headers";
import { hasSupabaseEnv, serverClient, adminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Json } from "@/lib/database.types";

/**
 * Enterprise audit logging — a tamper-evident trail of administrative,
 * security-relevant, and governance actions, written to `audit_logs`.
 *
 * The live `audit_logs` table is the legacy-shaped schema reconciled during
 * the DB migration passes:
 *
 *   id, organization_id, actor_id, actor_user_id, action,
 *   entity_type, entity_id, before_state, after_state,
 *   metadata, ip_address, user_agent, created_at
 *
 * plus the governance columns added by migration `20260830110000_audit_trail.sql`:
 *
 *   actor_type, target_module, changes
 *
 * IMPORTANT schema note: `audit_logs.action` is a constrained Postgres enum
 * (`audit_action`) with the values { create, read, update, delete, export,
 * login, logout, approve, reject, generate } — NOT free text. The app's rich
 * dotted action labels (e.g. "member.remove", "module.create",
 * "copilot.tool.approve_offboarding") are therefore mapped to the enum verb
 * in `ACTION_TO_VERB` / `governanceVerbFor`, and the full dotted label is
 * preserved in `metadata.action` so nothing is lost.
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

/* ------------------------------------------------------------------ */
/* Governance logging (module CRUD, Copilot tools, inbound webhooks)  */
/* ------------------------------------------------------------------ */

/** Who performed the action. */
export type AuditActorType = "USER" | "COPILOT_AGENT" | "SYSTEM";

export interface GovernanceAuditEntry {
  /** Auth user id, or the agent/system identifier (e.g. "copilot-agent"). */
  actorId: string;
  actorType: AuditActorType;
  /** Machine-readable dotted action, e.g. "module.create", "copilot.tool.create_expense". */
  action: string;
  /** Module the action targeted, e.g. "expenses", "recruitment", "offboarding". */
  targetModule: string;
  targetId?: string | null;
  /** JSONB payload of what changed (sanitized of credentials). */
  changes?: Record<string, unknown>;
  organizationId?: string | null;
}

const SENSITIVE_KEY = /password|secret|token|api[_-]?key|credential|cvv|iban|routing|ssn/i;

/** Redacts credential-shaped keys before anything reaches the audit table. */
export function sanitizeAuditChanges(
  changes: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!changes) return {};
  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : value,
    ]),
  );
}

/**
 * Maps a governance action label onto the constrained `audit_action` enum.
 * The full label is always preserved in `metadata.action`.
 */
function governanceVerbFor(action: string): AuditVerb {
  const label = action.toLowerCase();
  if (/approve|advance|complete/.test(label)) return "approve";
  if (/denied|deny|reject|revoke/.test(label)) return "reject";
  if (/delete|remove|erase/.test(label)) return "delete";
  if (/update|transition|upsert|patch/.test(label)) return "update";
  if (/^fetch|read|get|list|load/.test(label)) return "read";
  if (/create|insert|record|create_expense|create_survey|create_scenario|create_contractor|create_asset/.test(label)) return "create";
  if (/export/.test(label)) return "export";
  if (/generate|screen|score|evaluate/.test(label)) return "generate";
  return "update";
}

/** Best-effort client IP from standard proxy headers. */
export function auditClientIp(): string | null {
  try {
    const requestHeaders = headers();
    const forwarded = requestHeaders.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
    return requestHeaders.get("x-real-ip");
  } catch {
    return null;
  }
}

/**
 * Governance audit writer for module CRUD, Copilot tool executions and
 * inbound webhook processing.
 *
 * Maps onto the legacy-shaped `audit_logs` table: the dotted action label +
 * actor_type + sanitized changes live in `metadata` / `changes`, while the
 * enum verb and entity columns stay in their constrained columns.
 *
 * By default the entry is written with the caller's own session (RLS-bound to
 * their tenant). Webhook/background paths pass `useAdmin: true` to write with
 * the service-role client. Never throws.
 */
export async function recordAuditLog(
  entry: GovernanceAuditEntry,
  options: { useAdmin?: boolean } = {},
): Promise<void> {
  const changes = sanitizeAuditChanges(entry.changes);
  const rawId = entry.targetId ?? null;
  const entityId =
    typeof rawId === "string" && UUID_RE.test(rawId) ? rawId : null;

  const metadata = {
    action: entry.action,
    actor_type: entry.actorType,
    target_id: rawId,
    changes,
  } as Record<string, unknown>;

  if (!hasSupabaseEnv()) {
    // Demo/offline: preserve the trail on stdout (actor id only — no PII).
    console.info(
      `[audit] actor=${entry.actorId} [${entry.actorType}] → ${entry.action} ${entry.targetModule}${
        rawId ? ` (${rawId})` : ""
      }`,
      changes,
    );
    return;
  }

  const row = {
    organization_id: entry.organizationId ?? null,
    actor_id: entry.actorId,
    actor_type: entry.actorType,
    action: governanceVerbFor(entry.action),
    entity_type: entry.targetModule,
    entity_id: entityId,
    target_module: entry.targetModule,
    changes: changes as Json,
    metadata: metadata as Json,
    ip_address: auditClientIp(),
  };

  try {
    const client = options.useAdmin ? adminClient() : serverClient();
    const { error } = await client.from("audit_logs").insert(row as never);
    if (error) {
      console.error("[audit] governance write failed:", error.message);
    }
  } catch {
    // Never let audit failure break the mutation it observes.
  }
}
