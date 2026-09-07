import { requireRole, rbacErrorResponse } from "@/lib/rbac";
import { captureException, errorTrackingBackend, errorTrackingStats } from "@/lib/observability/errors";
import { withHttpMetrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Controlled synthetic error for validating the error-tracking pipeline.
 * SUPER_ADMIN only. The event is tagged `[SYNTHETIC]` and carries a fake
 * secret in `extra` so the scrubber's effect is visible in the SaaS UI.
 */
export async function POST(request: Request): Promise<Response> {
  return withHttpMetrics(request, async () => {
    let ctx;
    try {
      ctx = await requireRole("SUPER_ADMIN");
    } catch (error) {
      return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const err = new Error(`Synthetic error-tracking test (request ${requestId})`);
    const result = await captureException(err, {
      requestId,
      route: "/api/system/error-test",
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      synthetic: true,
      extra: { api_key: "sk_test_SHOULD_BE_REDACTED_1234567890abcdef", note: "delete me — synthetic" },
      tags: { source: "error-test" },
    });
    return Response.json({ ok: true, data: { ...result, requestId, backend: errorTrackingBackend(), stats: errorTrackingStats() } });
  });
}
