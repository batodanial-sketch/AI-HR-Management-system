import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Edge Shield — distributed rate limiting for middleware.
 *
 * Primary: Upstash Redis (`@upstash/ratelimit`, fixed window) so limits are
 * consistent across all edge/serverless instances — the DDoS shield for
 * auth, webhooks, the Copilot orchestrator and module CRUD.
 *
 * Fallback: a capped in-memory bucket when Upstash env vars are absent
 * (single-instance deployments / demo mode). Capped so a spoofed-IP flood
 * cannot grow memory unbounded; the cap evicts the oldest bucket.
 *
 * Granular per-category limits (req/min):
 *   auth/webhooks → 10 · module CRUD → 100 per tenant · copilot → tier-based
 *
 * 429 responses are standardized: `Retry-After` (seconds) plus
 * `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`
 * (epoch-ms timestamp) — see `edgeRateLimitResponse`.
 */

export type EdgeRateCategory = "auth" | "webhook" | "module" | "copilot";

export const EDGE_LIMITS: Record<EdgeRateCategory, number> = {
  auth: 10,
  webhook: 10,
  module: 100,
  copilot: 30, // tier-adjusted in middleware via the license cookie
};

/** Copilot orchestrator tier budgets (req/min) — mirrors lib/rate-limit. */
export const EDGE_COPILOT_TIER_LIMITS: Record<string, number> = {
  TRIAL: 30,
  PRO: 120,
  ENTERPRISE: 600,
};

export const EDGE_DEFAULT_COPILOT_LIMIT = 60;

const WINDOW_SECONDS = 60;

export interface EdgeRateResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch-ms when the current window resets. */
  resetAt: number;
}

function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/* ── Upstash path ───────────────────────────────────────────────────────── */

let upstashCache: { instance: Ratelimit; limit: number } | null = null;

function getUpstashRatelimit(limit: number): Ratelimit | null {
  if (!isUpstashConfigured()) return null;
  if (upstashCache && upstashCache.limit === limit) {
    return upstashCache.instance;
  }
  try {
    const redis = Redis.fromEnv();
    const instance = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(limit, `${WINDOW_SECONDS} s`),
      prefix: "fluxentiq:edge",
      analytics: true,
    });
    upstashCache = { instance, limit };
    return instance;
  } catch {
    return null;
  }
}

/* ── In-memory fallback path ────────────────────────────────────────────── */

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();
const MAX_MEMORY_BUCKETS = 10_000;

function checkMemory(key: string, limit: number): EdgeRateResult {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const bucket: MemoryBucket = {
      count: 1,
      resetAt: now + WINDOW_SECONDS * 1000,
    };
    if (!existing && memoryBuckets.size >= MAX_MEMORY_BUCKETS) {
      // Evict the oldest bucket to bound memory.
      const oldest = memoryBuckets.keys().next().value;
      if (oldest !== undefined) memoryBuckets.delete(oldest);
    }
    memoryBuckets.set(key, bucket);
    return { allowed: true, limit, remaining: limit - 1, resetAt: bucket.resetAt };
  }
  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  return { allowed: remaining > 0, limit, remaining, resetAt: existing.resetAt };
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Checks the edge rate limit for a key in the given category.
 * Always resolves (never throws) — a broken limiter must not take the app down.
 */
export async function checkEdgeRate(
  category: EdgeRateCategory,
  key: string,
  limitOverride?: number,
): Promise<EdgeRateResult> {
  const limit = limitOverride ?? EDGE_LIMITS[category];

  const ratelimit = getUpstashRatelimit(limit);
  if (ratelimit) {
    try {
      const result = await ratelimit.limit(key);
      return {
        allowed: result.success,
        limit,
        remaining: result.remaining,
        resetAt: result.reset,
      };
    } catch {
      // Redis blip → fall through to the memory limiter (fail-open-ish but
      // still bounded locally).
    }
  }

  return checkMemory(key, limit);
}

/**
 * Standardized 429 body + headers (Retry-After + rate-limit metadata).
 * Middleware wraps this in a NextResponse (see middleware.ts).
 */
export function edgeRateBody(result: EdgeRateResult): { body: object; headers: Record<string, string> } {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return {
    body: {
      ok: false,
      error: "Rate limit exceeded. Try again shortly.",
      code: "RATE_LIMITED",
    },
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(result.resetAt),
    },
  };
}

/** True when the request path belongs to an edge-limited category. */
export function edgeRateCategoryFor(pathname: string): EdgeRateCategory | null {
  if (
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/desktop/") ||
    pathname.startsWith("/api/scim/")
  ) {
    return "webhook";
  }
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth/")
  ) {
    return "auth";
  }
  if (pathname.startsWith("/api/ai/") || pathname.startsWith("/api/engine/")) {
    return "copilot";
  }
  if (
    pathname.startsWith("/api/employees") ||
    pathname.startsWith("/api/benefits") ||
    pathname.startsWith("/api/equity") ||
    pathname.startsWith("/api/expenses") ||
    pathname.startsWith("/api/surveys") ||
    pathname.startsWith("/api/planning") ||
    pathname.startsWith("/api/contractors") ||
    pathname.startsWith("/api/offboarding") ||
    pathname.startsWith("/api/assets") ||
    pathname.startsWith("/api/documents") ||
    pathname.startsWith("/api/screening") ||
    pathname.startsWith("/api/team")
  ) {
    return "module";
  }
  return null;
}

/** Best-effort client IP from standard proxy headers (middleware runs at the
 * edge, where x-forwarded-for is set by the platform, not the client). */
export function edgeClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
}
