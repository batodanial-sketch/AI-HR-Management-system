import "server-only";

/**
 * Rate limiting for the AI surface.
 *
 * A fixed-window, in-memory limiter keyed by IP (via `x-forwarded-for`) with a
 * per-feature budget. In-memory is intentional: the AI proxy routes run in a
 * single Node process, and a Redis-backed limiter would add an external
 * dependency. Enterprise buyers behind a load balancer can raise the limits
 * via env vars.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

const DEFAULT_LIMIT = Number(process.env.AI_RATE_LIMIT ?? "60");
const WINDOW_MS = Number(process.env.AI_RATE_WINDOW_MS ?? "60000");

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
}

export function checkRateLimit(key: string): RateLimitResult {
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
    return { allowed: true, remaining: DEFAULT_LIMIT - 1, resetAt };
  }

  if (bucket.count >= DEFAULT_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: DEFAULT_LIMIT - bucket.count,
    resetAt: bucket.resetAt,
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
