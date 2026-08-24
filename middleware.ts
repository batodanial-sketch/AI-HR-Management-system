import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseUrl, supabasePublishableKey } from "@/lib/supabase/env";

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
// the license/auth gate so n8n, Slack and inbound webhooks keep working.
const WEBHOOK_PREFIXES = ["/api/webhooks/", "/api/desktop/"];

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

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Expose the resolved pathname to server components (root layout) so it can
  // skip expensive auth/license resolution on public surfaces. Threaded through
  // every `next()` below.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const forwarded = { request: { headers: requestHeaders } };

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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
