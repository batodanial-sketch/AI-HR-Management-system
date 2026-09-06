import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { type SessionUser } from "@/lib/auth";
import { AuthzDeniedError, resolveCanonicalAuthz } from "@/lib/authz/canonical";
import { RB_ROLES, roleAtLeast, type RbRole } from "@/lib/authz/model";
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
 * The role comes exclusively from the canonical membership resolver
 * (`lib/authz/canonical.ts`). A caller without a valid canonical membership
 * is DENIED (`AuthzDeniedError`) — there is no default role.
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
  /** Canonical role code (`memberships.role`); null only in demo mode. */
  roleCode: "owner" | "admin" | "manager" | "member" | null;
  /** Canonical membership row id; null only in demo mode. */
  membershipId: string | null;
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

/**
 * Resolves the caller's RBAC context (cached per request).
 *
 * Throws {@link AuthzDeniedError} when Supabase is configured and the caller
 * has no valid canonical membership. Route handlers translate that into a
 * 401/403 via {@link rbacErrorResponse}.
 */
export const getRbacContext = cache(async (): Promise<RbacContext> => {
  const override = e2eRoleOverride();

  // Demo/preview (Supabase unconfigured): the demo admin identity drives
  // access. The E2E override may still simulate an under-privileged role.
  if (!hasSupabaseEnv()) {
    const user: SessionUser = {
      id: "demo-user",
      email: "ayesha.rahman@fluxentiq.test",
      fullName: "Ayesha Rahman",
      organizationId: "11111111-1111-4111-8111-111111111111",
      role: "admin",
    };
    const role: RbRole = override ?? "HR_ADMIN";
    return {
      user,
      organizationId: user.organizationId ?? "",
      role,
      scope: override ? scopeForRole(role) : "org",
      employeeId: null,
      reportIds: [],
      demoMode: !override,
      roleCode: override ? null : "admin",
      membershipId: null,
    };
  }

  const authz = await resolveCanonicalAuthz();
  if (!authz.ok) {
    throw new AuthzDeniedError(authz.reason, authz.detail);
  }

  const { actor, membership } = authz;
  const user: SessionUser = {
    id: actor.id,
    email: actor.email,
    fullName: actor.fullName,
    organizationId: membership.organizationId,
    role: membership.roleCode,
  };

  // Test hook: simulate an under-privileged role for a REAL membership. The
  // override can only ever lower/adjust the tier of an authenticated,
  // canonically-resolved member — it never grants a tenant.
  const role: RbRole = override ?? membership.role;

  const base: RbacContext = {
    user,
    organizationId: membership.organizationId,
    role,
    scope: scopeForRole(role),
    employeeId: null,
    reportIds: [],
    demoMode: false,
    roleCode: membership.roleCode,
    membershipId: membership.membershipId,
  };

  const linkage = await resolveEmployeeLinkage(membership.organizationId, actor.email);
  base.employeeId = linkage.employeeId;
  base.reportIds = linkage.reportIds;
  return base;
});

function scopeForRole(role: RbRole): AccessScope {
  return roleAtLeast(role, "HR_ADMIN") ? "org" : roleAtLeast(role, "MANAGER") ? "team" : "self";
}

/**
 * Maps an authorization failure to an HTTP response. Unauthenticated → 401,
 * every other canonical denial (no/ambiguous membership, unknown role) → 403.
 * Returns null for non-authorization errors so callers can rethrow.
 */
export function rbacErrorResponse(error: unknown): Response | null {
  if (error instanceof RbacForbiddenError) {
    return Response.json({ ok: false, error: error.message, code: error.code }, { status: 403 });
  }
  if (error instanceof AuthzDeniedError) {
    const status = error.reason === "UNAUTHENTICATED" ? 401 : 403;
    return Response.json({ ok: false, error: error.message, code: error.code, reason: error.reason }, { status });
  }
  return null;
}

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
