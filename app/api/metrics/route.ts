import { timingSafeEqual } from "node:crypto";
import { metrics, metricsBackend } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prometheus scrape endpoint. Protected by a bearer token (METRICS_TOKEN);
 * disabled (404) unless METRICS_BACKEND=prometheus. Exposes only bounded,
 * label-allowlisted series — never identifiers.
 */
export async function GET(request: Request): Promise<Response> {
  if (metricsBackend() !== "prometheus") return new Response("Not found", { status: 404 });
  const token = process.env.METRICS_TOKEN ?? "";
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || provided.length !== token.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(token))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response(metrics.renderPrometheus(), { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
}
