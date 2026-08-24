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
  const next = searchParams.get("next") ?? "/dashboard";
  const wantsTrial = searchParams.get("trial") === "true";

  const url = supabaseUrl();
  const anonKey = supabasePublishableKey();

  if (!url || !anonKey || !code) {
    return NextResponse.redirect(`${origin}/login?error=invalid_callback`);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookies().getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookies().set(name, value, options),
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
