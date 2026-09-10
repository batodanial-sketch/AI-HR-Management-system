import "server-only";

import { getRbacContext, rbacErrorResponse, type RbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/authz/model";

/**
 * Knowledge guards. Reading company knowledge is a membership right (every
 * member may search); writing is HR_ADMIN+ (curated corpus).
 */
export async function requireKnowledgeRead(): Promise<RbacContext | Response> {
  try {
    return await getRbacContext();
  } catch (error) {
    return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
}

export async function requireKnowledgeWrite(): Promise<RbacContext | Response> {
  const ctx = await requireKnowledgeRead();
  if (ctx instanceof Response) return ctx;
  if (!ctx.demoMode && !roleAtLeast(ctx.role, "HR_ADMIN")) {
    return Response.json(
      { ok: false, error: `RBAC: HR_ADMIN role required — the ${ctx.role} role is not authorized.`, code: "RBAC_FORBIDDEN" },
      { status: 403 },
    );
  }
  return ctx;
}
