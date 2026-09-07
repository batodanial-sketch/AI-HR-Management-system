import { NextResponse } from "next/server";
import { hasSupabaseEnv, adminClient } from "@/lib/supabase/server";
import { bridgeUrl, bridgeSecret } from "@/lib/ai-proxy";
import { aiKillSwitchOn, pilotConfigFindings } from "@/lib/pilot/controls";
import { scannerConfig, scannerEnforced } from "@/lib/storage/scanner";
import { storageConfigured, storageProviderName } from "@/lib/storage/provider";
import { metricsBackend } from "@/lib/observability/metrics";
import { errorTrackingBackend } from "@/lib/observability/errors";
import { appVersion } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness probe: 200 only when the deployment can safely serve the pilot.
 * Unauthenticated (load balancers), but reveals no hosts, keys or tenants.
 */
export async function GET(): Promise<NextResponse> {
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  const t0 = Date.now();

  if (hasSupabaseEnv()) {
    try {
      const { error } = await adminClient().from("organizations").select("id", { head: true, count: "exact" }).limit(1);
      checks.database = { ok: !error, detail: error ? "query failed" : `ok (${Date.now() - t0}ms)` };
    } catch {
      checks.database = { ok: false, detail: "unreachable" };
    }
  } else {
    checks.database = { ok: false, detail: "Supabase not configured (demo mode)" };
  }

  try {
    const res = await fetch(`${bridgeUrl()}/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { ai?: { configured?: boolean } };
    checks.aiBridge = { ok: res.ok, detail: res.ok ? (body.ai?.configured ? "provider configured" : "reachable, provider not configured") : `HTTP ${res.status}` };
  } catch {
    checks.aiBridge = { ok: aiKillSwitchOn(), detail: aiKillSwitchOn() ? "unreachable (kill switch on — acceptable)" : "unreachable" };
  }
  checks.bridgeSecret = { ok: Boolean(bridgeSecret()), detail: bridgeSecret() ? "set" : "missing" };
  checks.storage = { ok: storageConfigured() && storageProviderName() === "supabase", detail: `provider=${storageProviderName()}` };
  checks.malwareScanner = { ok: scannerEnforced(), detail: `backend=${scannerConfig().backend}` };
  checks.metrics = { ok: metricsBackend() !== "none", detail: `backend=${metricsBackend()}` };
  checks.errorTracking = { ok: errorTrackingBackend() !== "none", detail: `backend=${errorTrackingBackend()}` };
  const findings = pilotConfigFindings();
  checks.pilotConfig = { ok: findings.length === 0, detail: findings.length ? findings.join(" ") : "ok" };

  const ready = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ready, version: appVersion(), buildId: process.env.APP_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null, environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development", killSwitch: aiKillSwitchOn(), checks, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
