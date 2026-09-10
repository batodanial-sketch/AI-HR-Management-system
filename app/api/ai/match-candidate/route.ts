import { z } from "zod";
import { requireRecruitmentRole } from "@/lib/recruitment/handler";
import { findSemanticCandidates } from "@/src/services/semanticSearchService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/match-candidate — semantic candidate matching via the
 * operator-configured external bridge (dormant unless
 * PYTHON_SEMANTIC_SEARCH_URL is set).
 *
 * Hardened: candidate matching is org-wide recruitment data, so the route is
 * deny-first HR_ADMIN+ (previously session-gated only). Prefer the
 * deterministic, explainable POST /api/recruitment/match for grounded
 * matching; this endpoint remains for operator semantic-search integrations.
 */

const schema = z.object({ jobContext: z.string().min(3).max(5000) });

export async function POST(req: Request): Promise<Response> {
  const gate = await requireRecruitmentRole();
  if (gate instanceof Response) return gate;
  try {
    const input = schema.parse(await req.json());
    const data = await findSemanticCandidates(input.jobContext, 5);
    return Response.json({ success: true, data });
  } catch (e) {
    return Response.json(
      { success: false, error: e instanceof Error ? e.message : "Candidate matching failed." },
      { status: 400 },
    );
  }
}
