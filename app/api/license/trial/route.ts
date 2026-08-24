import { NextResponse } from "next/server";
import { startTrial } from "@/lib/license";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_COOKIE = "fluxentiq.trial";
const LICENSE_COOKIE = "fluxentiq.license";

export async function POST(): Promise<NextResponse> {
  try {
    // Detect a real authenticated session so the client can route a returning
    // user straight to /dashboard while sending a brand-new visitor to /signup
    // (where they create the account the trial will be attached to).
    let authenticated = false;
    if (hasSupabaseEnv()) {
      const { data } = await serverClient().auth.getUser();
      authenticated = Boolean(data.user);
    }

    const license = await startTrial();
    const response = NextResponse.json({
      ok: true,
      success: true,
      authenticated,
      license,
    });
    // Stamp the cookie that unblocks the license gate for whatever tier is
    // active — trial OR an already-activated paid key (which startTrial never
    // downgrades). Without this, a paid-key instance would bounce straight
    // back to /auth/license after sign-up.
    //
    // The cookie is set SYNCHRONOUSLY on the response object before it is
    // returned, so it lands in the browser's jar atomically with the 200 body.
    const cookie = license.tier === "TRIAL" ? TRIAL_COOKIE : LICENSE_COOKIE;
    response.cookies.set(cookie, "valid", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 15,
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: err instanceof Error ? err.message : "Trial failed.",
      },
      { status: 500 },
    );
  }
}
