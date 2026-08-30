import { getSeatCapacity } from "@/lib/seats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Team capacity endpoint — live seat usage for the current organization.
 *
 * Used by the AI Copilot backend-state panel and any team-management surface
 * that needs to render remaining seats without hard-failing on stale counts.
 * Re-evaluates on every request (no caching), so adding/removing employees or
 * members is reflected immediately.
 */
export async function GET(): Promise<Response> {
  try {
    const capacity = await getSeatCapacity();
    return Response.json({
      ok: true,
      capacity: {
        tier: capacity.tier,
        limit: Number.isFinite(capacity.limit) ? capacity.limit : null,
        used: capacity.used,
        available: Number.isFinite(capacity.available) ? capacity.available : null,
        limited: capacity.limited,
        demoMode: capacity.demoMode,
        systemAccountsExcluded: capacity.systemAccountsExcluded,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to compute seat capacity.",
      },
      { status: 500 },
    );
  }
}
