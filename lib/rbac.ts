import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import {
  getCurrentUser,
  normalizeRole,
  RB_ROLES,
  roleAtLeast,
  type RbRole,
  type SessionUser,
} from "@/lib/auth";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";

/**
 * Tenant RBAC scope resolution.
 *
 * Resolves the caller's effective role + data scope per request:
 *
 *   SUPER_ADMIN / HR_ADMIN  → `org`   (unrestricted, org-wide)
 *   MANAGER                 → `team`  (self + direct reports)
 *   EMPLOYEE                → `self`  (personal records only)
 *
 * The employee linkage (auth user → employees row) is resolved by email, and
 * direct reports by `employees.manager_id`. In demo mode (Supabase
 * unconfigured) the demo admin identity resolves to org scope, keeping the
 * preview fully functional while writes stay disabled elsewhere.
 */

export type AccessScope = "org" | "team" | "self";

export interface RbacContext {
  user: SessionUser;
  organizationId: string;
  role: RbRole;
  scope: AccessScope;
  /** The caller's own employee row id (null when not an employee). */
  employeeId: string | null;
  /** Direct reports' employee ids (MANAGER scope). */
  reportIds: string[];
  /** True when Supabase is unconfigured (demo identity drives access). */
  demoMode: boolean;
}

/** Error thrown when the caller's role is below the required minimum. */
export class RbacForbiddenError extends Error {
  readonly code = "RBAC_FORBIDDEN";
  readonly required: RbRole;
  readonly actual: RbRole;

  constructor(required: RbRole, actual: RbRole) {
    super(
      `RBAC: ${required} role required — the ${actual} role is not authorized for this operation.`,
    );
    this.name = "RbacForbiddenError";
    this.required = required;
    this.actual = actual;
  }
}

interface EmployeeLinkRow {
  id: string;
  manager_id: string | null;
  work_email: string | null;
  personal_email: string | null;
}

async function resolveEmployeeLinkage(
  organizationId: string,
  email: string,
): Promise<{ employeeId: string | null; reportIds: string[] }> {
  try {
    const { data, error } = await serverClient()
      .from("employees")
      .select("id, manager_id, work_email, personal_email")
      .eq("organization_id", organizationId);
    if (error || !data) {
      return { employeeId: null, reportIds: [] };
    }
    const rows = data as unknown as EmployeeLinkRow[];
    const me =
      rows.find((row) =>
        [row.work_email, row.personal_email].some(
          (candidate) =>
            candidate && candidate.toLowerCase() === email.toLowerCase(),
        ),
      ) ?? null;
    if (!me) {
      return { employeeId: null, reportIds: [] };
    }
    const reportIds = rows
      .filter((row) => row.manager_id === me.id)
      .map((row) => row.id);
    return { employeeId: me.id, reportIds };
  } catch {
    // Fail closed: unresolved linkage degrades to `self` scope.
    return { employeeId: null, reportIds: [] };
  }
}

/**
 * E2E role override (test hook).
 *
 * Playwright's `rbac-boundaries.spec.ts` drives requests with the
 * `x-fluxentiq-e2e-role` header to verify strict HTTP 403 enforcement for
 * under-privileged roles. The hook is inert unless the server is started
 * with `E2E_ROLE_OVERRIDE_ENABLED=1` and NEVER active in production builds.
 */
function e2eRoleOverride(): RbRole | null {
  if (
    process.env.E2E_ROLE_OVERRIDE_ENABLED !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    return null;
  }
  try {
    const value = headers().get("x-fluxentiq-e2e-role");
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    return (RB_ROLES as string[]).includes(normalized) ? (normalized as RbRole) : null;
  } catch {
    return null;
  }
}

/** Resolves the caller's RBAC context (cached per request). */
export const getRbacContext = cache(async (): Promise<RbacContext> => {
  const user = await getCurrentUser();
  let role = normalizeRole(user.role);
  const override = e2eRoleOverride();
  const demoMode = !hasSupabaseEnv() || !user.organizationId;
  const organizationId = user.organizationId ?? "";

  // Test hook: simulate an under-privileged role with a real org context.
  if (override) {
    role = override;
  }
  const effectiveDemo = demoMode && !override;

  const scope: AccessScope = effectiveDemo
    ? "org"
    : roleAtLeast(role, "HR_ADMIN")
      ? "org"
      : roleAtLeast(role, "MANAGER")
        ? "team"
        : "self";

  const base: RbacContext = {
    user,
    organizationId,
    role,
    scope,
    employeeId: null,
    reportIds: [],
    demoMode: effectiveDemo,
  };

  if (effectiveDemo) return base;

  const linkage = await resolveEmployeeLinkage(organizationId, user.email);
  base.employeeId = linkage.employeeId;
  base.reportIds = linkage.reportIds;
  return base;
});

/**
 * Employee ids the caller may touch, or `null` when unrestricted (org scope).
 * Scoped callers without an employee linkage receive the `__none__` sentinel,
 * which matches no rows — they can read nothing until linkage resolves.
 */
export function scopedEmployeeIds(ctx: RbacContext): string[] | null {
  if (ctx.scope === "org") return null;
  const ids = ctx.employeeId ? [ctx.employeeId, ...ctx.reportIds] : [];
  return ids.length > 0 ? ids : ["__none__"];
}

/**
 * Asserts the caller's role meets the minimum, throwing
 * {@link RbacForbiddenError} otherwise. HR_ADMIN+ passes for EMPLOYEE-level
 * minimums by hierarchy.
 */
export async function requireRole(minimum: RbRole): Promise<RbacContext> {
  const ctx = await getRbacContext();
  if (!ctx.demoMode && !roleAtLeast(ctx.role, minimum)) {
    throw new RbacForbiddenError(minimum, ctx.role);
  }
  return ctx;
}

/** True when the caller (scoped) may touch the given employee id. */
export function canTouchEmployee(ctx: RbacContext, employeeId: string | null): boolean {
  if (ctx.scope === "org") return true;
  if (!employeeId) return false;
  const allowed = scopedEmployeeIds(ctx);
  return allowed !== null && allowed.includes(employeeId);
}
