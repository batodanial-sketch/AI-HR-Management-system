import "server-only";

import { getRbacContext, rbacErrorResponse, type RbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/authz/model";

/**
 * Deny-first role guard for the intelligence API surface. Workforce insights
 * are org-wide HR data, so the whole surface requires HR_ADMIN+ (the same
 * bar as the recruitment scope and the screening module).
 */
export async function requireIntelligenceRole(): Promise<RbacContext | Response> {
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
