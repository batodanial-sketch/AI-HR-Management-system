import "server-only";

import { getRbacContext, rbacErrorResponse, type RbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/authz/model";

/**
 * Deny-first role guard for the recruitment-intelligence API surface.
 * Matches the recruitment server-action scope (HR_ADMIN+).
 */
export async function requireRecruitmentRole(): Promise<RbacContext | Response> {
  let ctx: RbacContext;
  try {
    ctx = await getRbacContext();
  } catch (error) {
    return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!ctx.demoMode && !roleAtLeast(ctx.role, "HR_ADMIN")) {
    return Response.json(
      { ok: false, error: `RBAC: HR_ADMIN role required — the ${ctx.role} role is not authorized.`, code: "RBAC_FORBIDDEN" },
      { status: 403 },
    );
  }
  return ctx;
}
