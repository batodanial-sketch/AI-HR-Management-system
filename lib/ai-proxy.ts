import "server-only";

/**
 * Server-side proxy to the Python AI bridge, with rate limiting, AI usage
 * metering, and webhook fan-out.
 *
 * The browser (and Playwright E2E suite) talks to Next.js at `/api/ai/*`;
 * these route handlers forward to the Python bridge at `AI_BRIDGE_URL` and
 * stream the response back. Each AI call is rate-limited, metered, and (for
 * streaming completions) triggers a `workflow.completed`-style audit event.
 */

import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { recordAiUsage, type AiFeature } from "@/lib/ai-usage";

export function bridgeUrl(): string {
  return process.env.AI_BRIDGE_URL ?? "http://localhost:8000";
}

/**
 * Shared secret authenticating Next.js → Python bridge requests. Mirrors the
 * bridge's `BRIDGE_SECRET_KEY`; the bridge fails closed (401) without it.
 */
export function bridgeSecret(): string {
  return process.env.BRIDGE_SECRET_KEY ?? "";
}

/** Headers applied to every upstream bridge request. */
function bridgeHeaders(contentType: string): Record<string, string> {
  const secret = bridgeSecret();
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (secret) {
    headers["X-Bridge-Secret"] = secret;
  }
  return headers;
}

const FEATURE_BY_PATH: Record<string, AiFeature> = {
  "/api/ai/copilot": "copilot",
  "/api/ai/evaluate-candidate": "candidate_evaluation",
  "/api/ai/evaluate-pto": "pto_evaluation",
  "/api/ai/parse-resume": "resume_parse",
  "/api/ai/rank-candidates": "candidate_ranking",
  "/api/ai/interview-report": "interview_report",
  "/api/ai/insights": "insights",
};

/** Meters engine calls under a dedicated feature bucket. */
function featureFor(pathname: string): AiFeature | undefined {
  if (pathname.startsWith("/api/engine/")) {
    return "insights"; // engine calls share the analytics metering bucket
  }
  return FEATURE_BY_PATH[pathname];
}

/**
 * Forwards an incoming request to the bridge and streams the upstream response.
 * Returns 429 when the rate limit is exceeded, 502 when the bridge is down.
 */
export async function proxyToBridge(
  request: Request,
  pathname: string,
): Promise<Response> {
  const rate = checkRateLimit(clientKey(request));
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({ detail: "Rate limit exceeded. Try again shortly." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const upstream = `${bridgeUrl()}${pathname}`;
  const contentType = request.headers.get("content-type") ?? "application/json";
  const body = await request.arrayBuffer();

  // Meter the call (best-effort; token counts are unknown for proxied calls).
  const feature = featureFor(pathname);
  if (feature) {
    void recordAiUsage({ feature });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream, {
      method: request.method,
      headers: bridgeHeaders(contentType),
      body,
    });
  } catch {
    return new Response(
      JSON.stringify({ detail: `AI bridge unreachable at ${upstream}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const responseType = upstreamResponse.headers.get("content-type") ?? "application/json";

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": responseType,
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-RateLimit-Remaining": String(rate.remaining),
    },
  });
}
