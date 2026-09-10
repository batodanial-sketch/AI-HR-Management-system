import { getInsightSet } from "@/lib/intelligence/aggregator";
import { requireIntelligenceRole } from "@/lib/intelligence/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/insights — ranked workforce insight set.
 * HR_ADMIN+ (org-wide HR data). Read-only; deterministic from current data.
 */
export async function GET(): Promise<Response> {
  const gate = await requireIntelligenceRole();
  if (gate instanceof Response) return gate;
  try {
    const set = await getInsightSet();
    return Response.json(
      { ok: true, insights: set.insights, sources: set.sources, generatedAt: set.generatedAt, count: set.insights.length, scope: gate.scope },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to compute insights." },
      { status: 500 },
    );
  }
}
