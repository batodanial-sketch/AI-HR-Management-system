import { getRbacContext, rbacErrorResponse } from "@/lib/rbac";
import { bridgeUrl, bridgeSecret } from "@/lib/ai-proxy";
import { aiKillSwitchOn, evaluatePilotAccess, maxRequestTokens, maxToolRounds, pilotAllowlist } from "@/lib/pilot/controls";
import { metrics, withHttpMetrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI subsystem status for operators and the pilot dashboard. Authenticated
 * (canonical membership required) — reports configuration state and bridge
 * reachability WITHOUT exposing provider hosts, keys or model credentials.
 */
export async function GET(request: Request): Promise<Response> {
  return withHttpMetrics(request, async () => {
    let ctx;
    try {
      ctx = await getRbacContext();
    } catch (error) {
      return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const t0 = Date.now();
    let bridge: { reachable: boolean; configured: boolean; provider: string | null; model: string | null; latencyMs: number | null } = {
      reachable: false,
      configured: false,
      provider: null,
      model: null,
      latencyMs: null,
    };
    try {
      const res = await fetch(`${bridgeUrl()}/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { ai?: { configured?: boolean; provider?: string; model?: string | null } };
      bridge = {
        reachable: res.ok,
        configured: Boolean(body.ai?.configured),
        provider: body.ai?.provider ?? null,
        model: body.ai?.model ?? null,
        latencyMs: Date.now() - t0,
      };
    } catch {
      metrics.increment("ai_failures_total", { feature: "status", reason: "unavailable" });
    }
    const pilot = evaluatePilotAccess({ organizationId: ctx.demoMode ? null : ctx.organizationId });
    const enabled = !aiKillSwitchOn() && bridge.reachable && bridge.configured && Boolean(bridgeSecret());
    return Response.json(
      {
        ok: true,
        data: {
          enabled,
          killSwitch: aiKillSwitchOn(),
          bridge,
          bridgeSecretConfigured: Boolean(bridgeSecret()),
          pilot: {
            thisOrgAllowed: pilot.allowed,
            reason: pilot.code,
            allowlistSize: pilotAllowlist().length,
            maxRequestTokens: maxRequestTokens(),
            maxToolRounds: maxToolRounds(),
          },
          checkedAt: new Date().toISOString(),
        },
      },
      { status: enabled || aiKillSwitchOn() ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  });
}
