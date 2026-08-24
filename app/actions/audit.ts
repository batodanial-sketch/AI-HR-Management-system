"use server";

import { z } from "zod";
import { createServerSupabaseClient, type AuditLogRow } from "@/src/lib/supabase";
import { getMembers } from "@/lib/api";
import type { Json } from "@/lib/database.types";
import type { ActionResponse } from "./types";
import { actionFailure, actionSuccess } from "./types";
import { requireOrganizationContext, uuidSchema, validationFailure } from "./_shared";

/**
 * Enterprise compliance audit-log server actions.
 *
 * All reads are scoped strictly to the current user's `organization_id`
 * (enforced twice: once by the explicit `.eq()` and once by the RLS
 * `is_organization_member` policy), so no cross-tenant data can leak.
 * Exports additionally require an admin role.
 */

/** The constrained `audit_action` enum verbs. */
export const AUDIT_ACTION_VERBS = [
  "create",
  "read",
  "update",
  "delete",
  "export",
  "login",
  "logout",
  "approve",
  "reject",
  "generate",
] as const;

export type AuditActionVerb = (typeof AUDIT_ACTION_VERBS)[number];

/** A display-ready audit-log record. */
export interface AuditLogView {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  /** Rich dotted action label (metadata.action) when present, else the verb. */
  actionLabel: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogListResult {
  rows: AuditLogView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditExportFile {
  filename: string;
  content: string;
  contentType: string;
}

const auditFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  action: z.enum(AUDIT_ACTION_VERBS).optional(),
  actorUserId: uuidSchema.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid from date.").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid to date.").optional(),
});

const auditPageSchema = auditFilterSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});

/** Extracts the rich dotted action label from the metadata jsonb, if any. */
function richActionLabel(metadata: Json | null): string | null {
  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    "action" in metadata
  ) {
    const value = (metadata as Record<string, unknown>).action;
    return typeof value === "string" ? value : null;
  }
  return null;
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Builds a scoped, filtered audit_logs query (no range — caller applies it). */
function buildAuditQuery(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  filter: z.infer<typeof auditFilterSchema>,
) {
  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId);

  if (filter.search) {
    query = query.ilike("entity_type", `%${filter.search}%`);
  }
  if (filter.action) {
    query = query.eq("action", filter.action);
  }
  if (filter.actorUserId) {
    query = query.eq("actor_id", filter.actorUserId);
  }
  if (filter.from) {
    query = query.gte("created_at", `${filter.from}T00:00:00Z`);
  }
  if (filter.to) {
    query = query.lte("created_at", `${filter.to}T23:59:59Z`);
  }
  return query.order("created_at", { ascending: false });
}

/** Maps a raw row + the org member name map into the display view. */
function mapRow(
  row: AuditLogRow,
  nameById: Map<string, string>,
): AuditLogView {
  // The generated Row type is non-null for most columns, but the live table
  // leaves actor_id / entity_id / ip_address nullable — coerce defensively.
  const actorId = row.actor_id ? row.actor_id : null;
  const action = row.action ? row.action : "unknown";
  const rich = richActionLabel(row.metadata ?? null);
  return {
    id: String(row.id),
    actorId,
    actorName: actorId ? (nameById.get(actorId) ?? null) : null,
    action,
    actionLabel: rich ?? action,
    resourceType: row.entity_type ? row.entity_type : "—",
    resourceId: row.entity_id ? row.entity_id : null,
    ipAddress: row.ip_address ? row.ip_address : null,
    createdAt: row.created_at ?? "",
  };
}

async function resolveMemberNames(): Promise<Map<string, string>> {
  const members = await getMembers();
  return new Map(members.map((member) => [member.userId, member.fullName]));
}

/** Lists audit-log records for the current org, filtered + paginated. */
export async function listAuditLogsAction(
  input: z.input<typeof auditPageSchema> = {},
): Promise<ActionResponse<AuditLogListResult>> {
  const parsed = auditPageSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  const auth = await requireOrganizationContext("employee");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { page, pageSize, ...filter } = parsed.data;
    const nameById = await resolveMemberNames();

    const fromIndex = (page - 1) * pageSize;
    const toIndex = fromIndex + pageSize - 1;

    const { data, error, count } = await buildAuditQuery(
      supabase,
      auth.data.organizationId,
      filter,
    ).range(fromIndex, toIndex);

    if (error) {
      return actionFailure(error.message);
    }

    const rows = (data ?? []).map((row) => mapRow(row, nameById));
    return actionSuccess({
      rows,
      total: count ?? rows.length,
      page,
      pageSize,
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to load audit logs.",
    );
  }
}

/** Fetches the full filtered audit set (capped) for export. */
async function fetchAuditRowsForExport(
  filter: z.infer<typeof auditFilterSchema>,
  organizationId: string,
  maxRows = 5000,
): Promise<AuditLogView[]> {
  const supabase = await createServerSupabaseClient();
  const nameById = await resolveMemberNames();
  const { data, error } = await buildAuditQuery(supabase, organizationId, filter).limit(maxRows);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapRow(row, nameById));
}

/** Exports the org's audit log as CSV (admin only). */
export async function exportAuditLogsCSV(
  input: z.input<typeof auditFilterSchema> = {},
): Promise<ActionResponse<AuditExportFile>> {
  const parsed = auditFilterSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  const auth = await requireOrganizationContext("admin");
  if (!auth.success) {
    return auth;
  }

  try {
    const rows = await fetchAuditRowsForExport(parsed.data, auth.data.organizationId);
    const header = ["Actor", "Action", "Resource", "IP Address", "Timestamp"];
    const body = rows.map((row) =>
      [
        row.actorName ?? row.actorId ?? "",
        row.actionLabel,
        row.resourceType,
        row.ipAddress ?? "",
        row.createdAt,
      ]
        .map(csvEscape)
        .join(","),
    );
    const content = [header.map(csvEscape).join(","), ...body].join("\n");
    return actionSuccess({
      filename: "audit-logs.csv",
      content,
      contentType: "text/csv;charset=utf-8",
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to export audit logs.",
    );
  }
}

/** Exports the org's audit log as JSON (admin only). */
export async function exportAuditLogsJSON(
  input: z.input<typeof auditFilterSchema> = {},
): Promise<ActionResponse<AuditExportFile>> {
  const parsed = auditFilterSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  const auth = await requireOrganizationContext("admin");
  if (!auth.success) {
    return auth;
  }

  try {
    const rows = await fetchAuditRowsForExport(parsed.data, auth.data.organizationId);
    return actionSuccess({
      filename: "audit-logs.json",
      content: JSON.stringify(rows, null, 2),
      contentType: "application/json;charset=utf-8",
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to export audit logs.",
    );
  }
}
