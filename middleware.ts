import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseUrl, supabasePublishableKey } from "@/lib/supabase/env";
import {
  checkEdgeRate,
  edgeClientIp,
  edgeRateBody,
  edgeRateCategoryFor,
  EDGE_DEFAULT_COPILOT_LIMIT,
  type EdgeRateResult,
} from "@/lib/edge/rate-limit";

const SUPABASE_URL = supabaseUrl();
// Publishable key first, legacy anon key as fallback.
const SUPABASE_ANON_KEY = supabasePublishableKey();

const LICENSE_COOKIE = "fluxentiq.license";
const TRIAL_COOKIE = "fluxentiq.trial";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth/license",
  "/auth",
  "/api/license",
  "/api/auth",
  "/api/account",
  "/api/health",
  "/robots.txt",
  "/sitemap.xml",
  "/_next",
  "/favicon.ico",
];

// Public marketing surfaces (landing, pricing, docs) — never gated.
const MARKETING_PATHS = ["/", "/pricing", "/docs"];

// External integration endpoints authenticate via their own secrets (HMAC
// signatures, service tokens) rather than a browser session — exempt them from
// the license/auth gate so n8n, Slack, inbound webhooks, and IdP provisioning
// (SCIM) keep working.
const WEBHOOK_PREFIXES = ["/api/webhooks/", "/api/desktop/", "/api/scim/"];

function isPublic(pathname: string): boolean {
  if (WEBHOOK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  if (
    pathname.startsWith("/api") &&
    !pathname.startsWith("/api/license") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/api/account") &&
    !pathname.startsWith("/api/health")
  ) {
    return false;
  }
  if (MARKETING_PATHS.some((prefix) => pathname === prefix)) {
    return true;
  }
  return PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function isLicenseProtected(pathname: string): boolean {
  // Everything in the app (not public paths, not static assets) is protected.
  if (isPublic(pathname)) {
    return false;
  }
  if (
    pathname.startsWith("/_next") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/.test(pathname)
  ) {
    return false;
  }
  return true;
}

/**
 * Edge Shield — coarse distributed rate limiting (Upstash Redis with a
 * capped in-memory fallback). Categories:
 *   auth/webhooks → 10 req/min (IP-keyed)      copilot → 60 req/min (IP)
 *   module CRUD   → 100 req/min per tenant     (org-keyed, after auth)
 *
 * The authoritative tier-based throttle for AI endpoints stays server-side
 * (lib/rate-limit + ai-proxy/orchestrator) where the license tier is
 * reliably resolvable; the edge layer exists to absorb floods before they
 * reach the app servers.
 */
function applyEdgeLimit(
  request: NextRequest,
  category: "auth" | "webhook" | "copilot",
): Promise<{ blocked: NextResponse | null; result: EdgeRateResult | null }> {
  const ip = edgeClientIp(request);
  const limit =
    category === "copilot" ? EDGE_DEFAULT_COPILOT_LIMIT : undefined;
  return checkEdgeRate(category, `${category}:ip:${ip}`, limit).then(
    (result) => {
      if (result.allowed) return { blocked: null, result };
      const { body, headers } = edgeRateBody(result);
      return { blocked: NextResponse.json(body, { status: 429, headers }), result };
    },
  );
}

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Correlation id: honour a well-formed inbound `x-request-id` (from the edge
 * proxy / load balancer), otherwise mint one. It is threaded to route handlers
 * via the request headers and echoed on every response so error-tracking
 * events, audit rows and access logs can be joined.
 */
function resolveRequestId(request: NextRequest): string {
  const inbound = request.headers.get("x-request-id");
  if (inbound && REQUEST_ID_RE.test(inbound)) return inbound;
  return crypto.randomUUID();
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const requestId = resolveRequestId(request);
  request.headers.set("x-request-id", requestId);
  const response = await handle(request, requestId);
  response.headers.set("x-request-id", requestId);
  return response;
}

async function handle(request: NextRequest, requestId: string): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Expose the resolved pathname to server components (root layout) so it can
  // skip expensive auth/license resolution on public surfaces. Threaded through
  // every `next()` below.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-request-id", requestId);
  const forwarded = { request: { headers: requestHeaders } };

  // ── Edge Shield (IP-keyed categories — runs even in demo mode) ─────────
  const edgeCategory = edgeRateCategoryFor(pathname);
  if (
    edgeCategory === "auth" ||
    edgeCategory === "webhook" ||
    edgeCategory === "copilot"
  ) {
    const { blocked } = await applyEdgeLimit(request, edgeCategory);
    if (blocked) return blocked;
  }

  // Demo/dev fallback: without Supabase credentials the app runs on seed data
  // and auth is not enforced (keeps the preview and local dev usable).
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next(forwarded);
  }

  if (isPublic(pathname)) {
    return NextResponse.next(forwarded);
  }

  // License/trial gate — a cheap cookie check to redirect unactivated
  // instances. The authoritative verification re-reads state server-side.
  if (
    isLicenseProtected(pathname) &&
    !request.cookies.get(LICENSE_COOKIE) &&
    !request.cookies.get(TRIAL_COOKIE)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/license";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next(forwarded);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next(forwarded);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    // A visitor with an active trial cookie but no session is a brand-new buyer
    // who has not created an account yet — send them to /signup (not /login,
    // which would be a dead end). A plain logged-out user still goes to /login.
    url.pathname = request.cookies.get(TRIAL_COOKIE) ? "/signup" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ── Module CRUD: 100 req/min per tenant (org-keyed) ────────────────────
  if (edgeCategory === "module") {
    // Rate-limit bucketing only — NOT an authorization decision. Reads the
    // canonical `memberships` table so the bucket matches the tenant the
    // canonical resolver will authorize downstream; falls back to a per-user
    // bucket when the caller has no single membership.
    let tenantKey = `module:user:${user.id}`;
    const { data: membershipRows } = await supabase
      .from("memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(2);
    if (membershipRows?.length === 1 && membershipRows[0]?.organization_id) {
      tenantKey = `module:tenant:${membershipRows[0].organization_id}`;
    }
    const moduleLimit = await checkEdgeRate("module", tenantKey);
    if (!moduleLimit.allowed) {
      const { body, headers } = edgeRateBody(moduleLimit);
      return NextResponse.json(body, { status: 429, headers });
    }
    response.headers.set("X-RateLimit-Limit", String(moduleLimit.limit));
    response.headers.set("X-RateLimit-Remaining", String(moduleLimit.remaining));
    response.headers.set("X-RateLimit-Reset", String(moduleLimit.resetAt));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
