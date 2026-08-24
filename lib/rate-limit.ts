import "server-only";
import type { LicenseTier } from "./license-format";

/**
 * Rate limiting for the AI surface — tier-aware.
 *
 * A fixed-window, in-memory limiter keyed by org + IP (via `x-forwarded-for`)
 * with a per-tier budget:
 *   TRIAL: 30 req/min
 *   PRO: 120 req/min
 *   ENTERPRISE: 600 req/min
 *
 * In-memory is intentional: the AI proxy routes run in a single Node process,
 * and a Redis-backed limiter would add an external dependency. Enterprise
 * buyers behind a load balancer can raise the limits via env vars.
 *
 * Tier limits are enforced via `limitForTier()` + `checkRateLimit(key, limit)`.
 * The proxy (`lib/ai-proxy.ts`) resolves the instance license tier and passes
 * the appropriate limit, falling back to `DEFAULT_LIMIT` when unlicensed.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

const DEFAULT_LIMIT = Number(process.env.AI_RATE_LIMIT ?? "60");
const WINDOW_MS = Number(process.env.AI_RATE_WINDOW_MS ?? "60000");

// Tier-aware budgets — per requirements (req/min).
export const TIER_LIMITS: Record<LicenseTier, number> = {
  TRIAL: Number(process.env.AI_RATE_LIMIT_TRIAL ?? "30"),
  PRO: Number(process.env.AI_RATE_LIMIT_PRO ?? "120"),
  ENTERPRISE: Number(process.env.AI_RATE_LIMIT_ENTERPRISE ?? "600"),
};

export function limitForTier(tier: LicenseTier | null | undefined): number {
  if (!tier) return DEFAULT_LIMIT;
  return TIER_LIMITS[tier] ?? DEFAULT_LIMIT;
}

// MEMORY-DoS GUARD: cap the number of live buckets. Without this, an attacker
// can trivially send requests from many distinct (spoofed) IPs and force a
// bucket per IP — each persisted for a full window — exhausting the process.
// When the cap is hit we evict the oldest bucket (Map preserves insertion
// order) before inserting a new one, bounding memory at a fixed ceiling.
const MAX_BUCKETS = Number(process.env.AI_RATE_MAX_BUCKETS ?? "10_000");

// TRUSTED-PROXY GUARD: `x-forwarded-for` is client-controlled. Only trust it
// when the deployment is explicitly behind a proxy that overwrites it
// (otherwise an attacker spoofs the header to rotate rate-limit keys at will).
const TRUST_PROXY =
  (process.env.AI_RATE_TRUST_PROXY ?? "false").toLowerCase() === "true";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * Fixed-window check with optional custom limit (tier-aware).
 * If `customLimit` is omitted, falls back to DEFAULT_LIMIT.
 */
export function checkRateLimit(
  key: string,
  customLimit?: number,
): RateLimitResult {
  const limit = customLimit ?? DEFAULT_LIMIT;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // Bound the map: evict the oldest bucket when at capacity before adding.
    if (buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) {
        buckets.delete(oldestKey);
      }
    }
    const resetAt = now + WINDOW_MS;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt, limit };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
    limit,
  };
}

export function clientKey(request: Request): string {
  // Only honor the client-controlled `x-forwarded-for` header when explicitly
  // running behind a trusted proxy. Otherwise fall back to a stable per-process
  // key (all requests share one bucket), which can't be spoofed. Deployments
  // behind a real proxy set AI_RATE_TRUST_PROXY=true to regain per-IP limiting.
  if (!TRUST_PROXY) {
    return "local";
  }
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/**
 * Builds an org-scoped rate-limit key: `org:<orgId>:<ip>` when orgId is known,
 * otherwise falls back to the IP-only key. This gives per-tenant isolation while
 * preserving the trusted-proxy guard.
 */
export function orgScopedKey(
  request: Request,
  organizationId?: string | null,
): string {
  const ipKey = clientKey(request);
  if (organizationId) {
    return `org:${organizationId}:${ipKey}`;
  }
  return ipKey;
}

// Opportunistic cleanup to bound memory (drop stale windows).
function sweep(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
const SWEEP_INTERVAL = setInterval(sweep, WINDOW_MS * 2);
if (SWEEP_INTERVAL.unref) {
  SWEEP_INTERVAL.unref();
}
