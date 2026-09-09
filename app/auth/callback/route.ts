import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { getLicenseState, startTrial } from "@/lib/license";
import { supabaseUrl, supabasePublishableKey } from "@/lib/supabase/env";
import { attachOrganizationClaim } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const TRIAL_COOKIE = "fluxentiq.trial";
const LICENSE_COOKIE = "fluxentiq.license";

/**
 * Restricts the post-auth `next` parameter to a local path. The callback
 * redirect target is built as `${origin}${next}` (never `next` alone), but
 * `next` is client-controlled query input — reject anything that is not a
 * single-slash-relative path so scheme-relative (`//host`), backslash and
 * other malformed values can never shape the Location header.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/dashboard";
  }
  return raw;
}

/**
 * Auth callback: exchanges the OAuth/email `code` for a session and redirects
 * to the app (or the `next` parameter). Shared by Google SSO and magic-link
 * email confirmation.
 *
 * When `trial=true` (set by the sign-up page's "Continue with Google"), the
 * 15-day trial is started automatically after a successful exchange.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const wantsTrial = searchParams.get("trial") === "true";

  const url = supabaseUrl();
  const anonKey = supabasePublishableKey();

  if (!url || !anonKey || !code) {
    return NextResponse.redirect(`${origin}/login?error=invalid_callback`);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      async getAll() {
        return (await cookies()).getAll();
      },
      async setAll(cookiesToSet) {
        try {
          const store = await cookies();
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Response already started; cookie handling delegated to middleware.
        }
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // Pin the user's tenant to app_metadata (Google signup provisions a new org
  // via the handle_new_user trigger; returning users already have one).
  if (data.user) {
    await attachOrganizationClaim(data.user.id);
  }

  // Sign-up flows (trial=true) start the trial; returning-user sign-ins reflect
  // the instance's already-active license/trial state. Either way, stamp the
  // matching cookie so the middleware license gate lets the user through.
  const license = wantsTrial ? await startTrial() : await getLicenseState();
  const response = NextResponse.redirect(`${origin}${next}`);
  if (license) {
    const cookie = license.tier === "TRIAL" ? TRIAL_COOKIE : LICENSE_COOKIE;
    response.cookies.set(cookie, "valid", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 15,
    });
  }
  return response;
}
