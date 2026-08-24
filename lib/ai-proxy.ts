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

import "server-only";

import { checkRateLimit, limitForTier, orgScopedKey } from "@/lib/rate-limit";
import { recordAiUsage, type AiFeature } from "@/lib/ai-usage";
import { getLicenseState } from "@/lib/license";
import { getCurrentUser } from "@/lib/auth";

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
function bridgeHeaders(
  contentType: string,
  organizationId?: string | null,
  licenseTier?: string | null,
): Record<string, string> {
  const secret = bridgeSecret();
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (secret) {
    headers["X-Bridge-Secret"] = secret;
  }
  if (organizationId) {
    headers["X-Organization-Id"] = organizationId;
  }
  if (licenseTier) {
    headers["X-License-Tier"] = licenseTier;
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
 * Tier-aware: Trial 30, Pro 120, Enterprise 600 req/min.
 * Org-scoped: key = org:<orgId>:<ip> when org is known.
 * Token-aware: reads X-Prompt-Tokens / X-Completion-Tokens / X-Model from bridge
 * response headers and records accurate usage.
 *
 * Returns 429 when the rate limit is exceeded, 502 when the bridge is down.
 */
export async function proxyToBridge(
  request: Request,
  pathname: string,
): Promise<Response> {
  // Resolve org + tier (best-effort, never block the request on failure).
  let organizationId: string | null = null;
  let tier: string | null = null;
  try {
    const user = await getCurrentUser();
    organizationId = user.organizationId ?? null;
  } catch {
    organizationId = null;
  }
  try {
    const license = await getLicenseState();
    tier = license?.tier ?? null;
  } catch {
    tier = null;
  }

  const tierLimit = limitForTier(tier as never);
  const rateKey = orgScopedKey(request, organizationId);
  const rate = checkRateLimit(rateKey, tierLimit);

  if (!rate.allowed) {
    return new Response(
      JSON.stringify({ detail: "Rate limit exceeded. Try again shortly." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Reset": String(rate.resetAt),
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const upstream = `${bridgeUrl()}${pathname}`;
  const contentType = request.headers.get("content-type") ?? "application/json";
  const body = await request.arrayBuffer();

  const feature = featureFor(pathname);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream, {
      method: request.method,
      headers: bridgeHeaders(contentType, organizationId, tier),
      body,
    });
  } catch {
    return new Response(
      JSON.stringify({ detail: `AI bridge unreachable at ${upstream}` }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const responseType =
    upstreamResponse.headers.get("content-type") ?? "application/json";

  // Token echo: bridge now returns X-Prompt-Tokens, X-Completion-Tokens, X-Model
  // for accurate metering (streaming calls still meter via bridge's own recorder,
  // but we capture headers when present for the Next.js ai_usage table).
  const promptTokensHeader = upstreamResponse.headers.get("X-Prompt-Tokens");
  const completionTokensHeader =
    upstreamResponse.headers.get("X-Completion-Tokens");
  const modelHeader = upstreamResponse.headers.get("X-Model");

  if (feature) {
    const promptTokens = promptTokensHeader
      ? Number(promptTokensHeader)
      : undefined;
    const completionTokens = completionTokensHeader
      ? Number(completionTokensHeader)
      : undefined;
    const model = modelHeader ?? undefined;

    void recordAiUsage({
      feature,
      model,
      tokensIn:
        promptTokens != null && Number.isFinite(promptTokens)
          ? promptTokens
          : undefined,
      tokensOut:
        completionTokens != null && Number.isFinite(completionTokens)
          ? completionTokens
          : undefined,
    });
  }

  // Forward token headers + rate-limit headers to client for observability.
  const headers: Record<string, string> = {
    "Content-Type": responseType,
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Reset": String(rate.resetAt),
  };

  // Preserve bridge's token headers if present.
  const forwardHeaders = [
    "X-Prompt-Tokens",
    "X-Completion-Tokens",
    "X-Model",
    "X-Feature",
    "X-Cost-Usd",
  ];
  for (const h of forwardHeaders) {
    const v = upstreamResponse.headers.get(h);
    if (v) headers[h] = v;
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}
