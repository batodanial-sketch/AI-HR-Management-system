import { z } from "zod";
import { requireRecruitmentRole } from "@/lib/recruitment/handler";
import { findSemanticCandidates } from "@/src/services/semanticSearchService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/semantic-search — semantic candidate search via the
 * operator-configured external bridge (dormant unless
 * PYTHON_SEMANTIC_SEARCH_URL is set).
 *
 * Hardened: deny-first HR_ADMIN+ (previously session-gated only), matching
 * the recruitment scope. Bounded limit; the bridge URL never leaks in errors.
 */

const schema = z.object({
  query: z.string().min(3).max(2000),
  limit: z.number().int().min(1).max(25).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const gate = await requireRecruitmentRole();
  if (gate instanceof Response) return gate;
  try {
    const input = schema.parse(await req.json());
    const data = await findSemanticCandidates(input.query, input.limit ?? 10);
    return Response.json({ success: true, data });
  } catch (e) {
    return Response.json(
      { success: false, error: e instanceof Error ? e.message : "Semantic search failed." },
      { status: 400 },
    );
  }
}
