import "server-only";
import type { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import {
  getRbacContext,
  canTouchEmployee,
  scopedEmployeeIds,
  type RbacContext,
} from "@/lib/rbac";
import { roleAtLeast, type RbRole } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

/**
 * Shared RBAC-guarded CRUD plumbing for the extended HR module API routes
 * (`/api/benefits`, `/api/equity`, `/api/expenses`, `/api/surveys`,
 * `/api/planning`, `/api/contractors`, `/api/offboarding`, `/api/assets`,
 * `/api/documents`, `/api/screening`).
 *
 * Role model (canonical):
 *   SUPER_ADMIN / HR_ADMIN → org-wide read/write
 *   MANAGER               → self + direct reports
 *   EMPLOYEE              → personal records only
 *
 * Every handler validates Zod input, resolves the caller's RBAC context, and
 * enforces the declared module policy before touching the RLS-bound Supabase
 * client, so tenant isolation + role scoping are enforced twice (app layer
 * and database layer).
 */

export function moduleError(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export function moduleForbidden(message: string): Response {
  return Response.json({ ok: false, error: message, code: "RBAC_FORBIDDEN" }, { status: 403 });
}

/** Lists module rows via a domain getter (which includes seed fallback). */
export async function handleModuleList<T>(
  loader: () => Promise<T[]>,
  options?: { minRole?: RbRole },
): Promise<Response> {
  try {
    const ctx = await getRbacContext();
    if (options?.minRole && !ctx.demoMode && !roleAtLeast(ctx.role, options.minRole)) {
      return moduleForbidden(
        `RBAC: ${options.minRole} role required to list this module — the ${ctx.role} role is not authorized.`,
      );
    }
    const data = await loader();
    return Response.json({ ok: true, data, count: data.length, scope: ctx.scope, role: ctx.role });
  } catch (error) {
    return moduleError(
      error instanceof Error ? error.message : "Unable to load module data.",
      500,
    );
  }
}

export interface ModuleContext {
  organizationId: string;
  userId: string;
}

/** Resolves the caller's organization + user context, or null (401). */
export async function moduleContext(): Promise<ModuleContext | null> {
  try {
    const user = await getCurrentUser();
    if (!user.organizationId) return null;
    return { organizationId: user.organizationId, userId: user.id };
  } catch {
    return null;
  }
}

/** Resolves the caller's RBAC context, or null (401). */
export async function moduleScopedContext(): Promise<RbacContext | null> {
  try {
    return await getRbacContext();
  } catch {
    return null;
  }
}

/** Write policy per module table. */
export interface ModuleWritePolicy<P = unknown> {
  /** Minimum role allowed to create/update rows in this table. */
  minRole: RbRole;
  /** The column carrying the subject employee id (null = table has none). */
  employeeIdField?: string | null;
  /** Extracts the subject employee id from the parsed payload. */
  employeeIdFromPayload?: (parsed: P) => string | undefined;
}

function enforceWritePolicy(
  ctx: RbacContext,
  policy: ModuleWritePolicy<unknown>,
  employeeId: string | null,
): string | null {
  if (ctx.demoMode) return null; // demo identity is org-admin
  if (!roleAtLeast(ctx.role, policy.minRole)) {
    return `RBAC: ${policy.minRole} role required to write this module — the ${ctx.role} role is not authorized.`;
  }
  if (policy.employeeIdField && !canTouchEmployee(ctx, employeeId)) {
    return `RBAC: the ${ctx.role} role can only act on personal or direct-report records.`;
  }
  return null;
}

type CreateRowMapper<P> = (parsed: P, ctx: ModuleContext) => Record<string, unknown>;

/**
 * Validates + inserts a module row under the declared write policy.
 */
export async function handleModuleCreate<P>(
  table: string,
  schema: z.ZodType<P>,
  input: unknown,
  toRow: CreateRowMapper<P>,
  policy: ModuleWritePolicy<P>,
  options?: {
    onCreated?: (data: unknown, ctx: ModuleContext) => unknown | Promise<unknown>;
  },
): Promise<Response> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join(" · ");
    return moduleError(`Validation failed — ${details}`, 400);
  }
  const ctx = await moduleScopedContext();
  if (!ctx) {
    return moduleError("Unauthorized — no organization context.", 401);
  }
  const employeeId =
    policy.employeeIdFromPayload && policy.employeeIdField
      ? policy.employeeIdFromPayload(parsed.data) ?? null
      : null;
  // Deny first: authorization is evaluated before availability so
  // unauthorized writers get 403 even when the database is unreachable.
  const denied = enforceWritePolicy(ctx, policy as ModuleWritePolicy<unknown>, employeeId);
  if (denied) {
    await recordAuditLog({
      actorId: ctx.user.id,
      actorType: "USER",
      action: "module.create.denied",
      targetModule: table,
      changes: { reason: denied },
      organizationId: ctx.organizationId,
    });
    return moduleForbidden(denied);
  }
  if (!hasSupabaseEnv()) {
    return moduleError(
      "Supabase is not configured — writes are disabled in demo mode.",
      503,
    );
  }

  try {
    const { data, error } = await serverClient()
      .from(table as never)
      .insert({
        organization_id: ctx.organizationId,
        ...toRow(parsed.data, { organizationId: ctx.organizationId, userId: ctx.user.id }),
      } as never)
      .select()
      .single();
    if (error) {
      return moduleError(`Write failed: ${error.message}`, 409);
    }
    await recordAuditLog({
      actorId: ctx.user.id,
      actorType: "USER",
      action: "module.create",
      targetModule: table,
      targetId: data ? String((data as { id?: unknown }).id ?? "") : null,
      changes: parsed.data as unknown as Record<string, unknown>,
      organizationId: ctx.organizationId,
    });
    if (options?.onCreated) {
      await options.onCreated(data, { organizationId: ctx.organizationId, userId: ctx.user.id });
    }
    return Response.json({ ok: true, data, scope: ctx.scope }, { status: 201 });
  } catch (error) {
    return moduleError(
      error instanceof Error ? error.message : "Write failed.",
      500,
    );
  }
}

type UpdateRowMapper<P> = (parsed: P, ctx: ModuleContext) => Record<string, unknown>;

/**
 * Validates + patches a module row (status transitions etc.) under the
 * declared write policy. The subject employee id is resolved from the live
 * row so EMPLOYEE/MANAGER can only mutate rows they own/manage.
 */
export async function handleModuleUpdate<P>(
  table: string,
  schema: z.ZodType<P>,
  input: unknown,
  toPatch: UpdateRowMapper<P>,
  policy: ModuleWritePolicy<P>,
  options?: {
    onUpdated?: (data: unknown, parsed: P, ctx: ModuleContext) => unknown | Promise<unknown>;
  },
): Promise<Response> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join(" · ");
    return moduleError(`Validation failed — ${details}`, 400);
  }
  const ctx = await moduleScopedContext();
  if (!ctx) {
    return moduleError("Unauthorized — no organization context.", 401);
  }
  const id = (parsed.data as { id?: unknown })?.id;
  if (typeof id !== "string" || !id) {
    return moduleError("Validation failed — id: required", 400);
  }

  let employeeId: string | null = null;
  if (hasSupabaseEnv() && policy.employeeIdField) {
    // Resolve the subject employee id from the existing row for scope checks.
    try {
      const { data: row } = await serverClient()
        .from(table as never)
        .select(`${policy.employeeIdField}`)
        .eq("id", id)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      employeeId = row?.[policy.employeeIdField as never] ?? null;
    } catch {
      // Scope check falls through to null → fail-closed for scoped roles.
    }
  }

  // Deny first (see handleModuleCreate) — unauthorized callers get 403
  // regardless of database availability.
  const denied = enforceWritePolicy(ctx, policy as ModuleWritePolicy<unknown>, employeeId);
  if (denied) {
    await recordAuditLog({
      actorId: ctx.user.id,
      actorType: "USER",
      action: "module.update.denied",
      targetModule: table,
      targetId: id,
      changes: { reason: denied },
      organizationId: ctx.organizationId,
    });
    return moduleForbidden(denied);
  }
  if (!hasSupabaseEnv()) {
    return moduleError(
      "Supabase is not configured — writes are disabled in demo mode.",
      503,
    );
  }

  try {
    const { data, error } = await serverClient()
      .from(table as never)
      .update(toPatch(parsed.data, { organizationId: ctx.organizationId, userId: ctx.user.id }) as never)
      .eq("id", id)
      .eq("organization_id", ctx.organizationId)
      .select()
      .single();
    if (error) {
      return moduleError(`Update failed: ${error.message}`, 409);
    }
    await recordAuditLog({
      actorId: ctx.user.id,
      actorType: "USER",
      action: "module.update",
      targetModule: table,
      targetId: id,
      changes: parsed.data as unknown as Record<string, unknown>,
      organizationId: ctx.organizationId,
    });
    if (options?.onUpdated) {
      await options.onUpdated(data, parsed.data, { organizationId: ctx.organizationId, userId: ctx.user.id });
    }
    return Response.json({ ok: true, data, scope: ctx.scope });
  } catch (error) {
    return moduleError(
      error instanceof Error ? error.message : "Update failed.",
      500,
    );
  }
}

/* ── Scoped reads (personal / direct-report rows) ───────────────────────── */

interface ScopedRow {
  id: string;
  organization_id: string;
  [key: string]: unknown;
}

async function selectScoped(
  table: string,
  ctx: RbacContext,
  employeeIdField: string,
): Promise<ScopedRow[]> {
  if (!hasSupabaseEnv()) return []; // fail open: no personal rows without a DB
  const ids = scopedEmployeeIds(ctx);
  if (!ids) return [];
  const { data, error } = await serverClient()
    .from(table as never)
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .in(employeeIdField, ids);
  if (error || !data) return [];
  return data as ScopedRow[];
}

function employeeNameMap(
  rows: Array<{ id: string; first_name?: string | null; last_name?: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    map.set(row.id, name || "Unknown");
  }
  return map;
}

async function loadEmployeeNames(
  ctx: RbacContext,
  employeeIds: string[],
): Promise<Map<string, string>> {
  if (employeeIds.length === 0) return new Map();
  const { data } = await serverClient()
    .from("employees")
    .select("id, first_name, last_name")
    .in("id", employeeIds)
    .eq("organization_id", ctx.organizationId);
  return employeeNameMap((data ?? []) as never);
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function numValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Scoped expenses (EMPLOYEE → own, MANAGER → self + direct reports). */
export async function scopedExpenseList(ctx: RbacContext): Promise<unknown[]> {
  const rows = await selectScoped("expense_reports", ctx, "employee_id");
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((row) => textValue(row.employee_id)))];
  const names = await loadEmployeeNames(ctx, ids);
  return rows.map((row) => ({
    id: textValue(row.id),
    employeeName: names.get(textValue(row.employee_id)) ?? textValue(row.employee_name, "Unknown"),
    merchant: textValue(row.merchant),
    category: textValue(row.category),
    amount: numValue(row.amount),
    currency: textValue(row.currency, "USD"),
    status: textValue(row.status, "pending"),
  }));
}

/** Scoped offboarding cases (EMPLOYEE → own, MANAGER → team). */
export async function scopedOffboardingList(ctx: RbacContext): Promise<unknown[]> {
  const rows = await selectScoped("offboarding_cases", ctx, "employee_id");
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((row) => textValue(row.employee_id)))];
  const names = await loadEmployeeNames(ctx, ids);
  return rows.map((row) => ({
    id: textValue(row.id),
    employeeName: names.get(textValue(row.employee_id)) ?? textValue(row.employee_name, "Unknown"),
    exitDate: textValue(row.exit_date),
    status: textValue(row.status, "planned"),
    tasksDone: numValue(row.tasks_done),
    tasksTotal: numValue(row.tasks_total),
  }));
}

/** Scoped assets (EMPLOYEE/MANAGER → assets assigned to self/team). */
export async function scopedAssetList(ctx: RbacContext): Promise<unknown[]> {
  if (!hasSupabaseEnv()) return [];
  const ids = scopedEmployeeIds(ctx);
  if (!ids) return [];
  const { data: assignments, error: assignmentError } = await serverClient()
    .from("asset_assignments")
    .select("asset_id")
    .eq("organization_id", ctx.organizationId)
    .in("employee_id", ids)
    .in("status", ["assigned"]);
  if (assignmentError || !assignments || assignments.length === 0) return [];
  const assetIds = [...new Set(assignments.map((row) => row.asset_id as string))];
  const { data: assets, error } = await serverClient()
    .from("assets")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .in("id", assetIds);
  if (error || !assets) return [];
  return (assets as ScopedRow[]).map((row) => ({
    id: textValue(row.id),
    name: textValue(row.name),
    category: textValue(row.category),
    status: textValue(row.status, "available"),
    assignee: textValue(row.assignee) || null,
  }));
}
