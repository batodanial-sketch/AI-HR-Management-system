import { z } from "zod";
import { getRbacContext, rbacErrorResponse } from "@/lib/rbac";
import { dispatchSearch } from "@/lib/search/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search — global search across employees, candidates, documents
 * and company knowledge.
 *
 * Security: the route requires an authenticated RBAC context, and every
 * source is one of the existing RBAC-guarded list routes called with the
 * caller's own session cookie — per-entity visibility rules are inherited,
 * never re-implemented. Sources the caller may not see are reported as
 * `denied` and contribute no data.
 */
const querySchema = z.object({
  q: z.string().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join(" · "),
      },
      { status: 400 },
    );
  }

  try {
    await getRbacContext();
  } catch (error) {
    return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const cookie = request.headers.get("cookie") ?? "";
  const outcome = await dispatchSearch({ origin, cookie, query: parsed.data.q, limit: parsed.data.limit });
  return Response.json(
    { ok: true, data: outcome.results, count: outcome.results.length, sources: outcome.sources },
    { headers: { "Cache-Control": "no-store" } },
  );
}
