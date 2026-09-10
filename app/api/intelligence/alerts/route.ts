import { getInsightSet } from "@/lib/intelligence/aggregator";
import { deriveAlerts } from "@/lib/intelligence/alerts";
import { requireIntelligenceRole } from "@/lib/intelligence/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/alerts — proactive alerts derived from live insights.
 * HR_ADMIN+. Alert ids are stable per rule+scope (dedup by id).
 */
export async function GET(): Promise<Response> {
  const gate = await requireIntelligenceRole();
  if (gate instanceof Response) return gate;
  try {
    const set = await getInsightSet();
    const alerts = deriveAlerts(set.insights, set.generatedAt);
    return Response.json(
      { ok: true, alerts, generatedAt: set.generatedAt, count: alerts.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to derive alerts." },
      { status: 500 },
    );
  }
}
