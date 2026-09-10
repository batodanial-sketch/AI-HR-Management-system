import { getInsightSet } from "@/lib/intelligence/aggregator";
import { composeBriefing } from "@/lib/intelligence/briefing";
import { requireIntelligenceRole } from "@/lib/intelligence/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/briefing — Daily HR Briefing (attention / positive /
 * recommended / insufficient). HR_ADMIN+. Read-only; composed from the live
 * insight set, never model-generated.
 */
export async function GET(): Promise<Response> {
  const gate = await requireIntelligenceRole();
  if (gate instanceof Response) return gate;
  try {
    const set = await getInsightSet();
    return Response.json(
      { ok: true, briefing: composeBriefing(set.insights, set.generatedAt) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to compose briefing." },
      { status: 500 },
    );
  }
}
