import { NextResponse } from "next/server";
import { getLicenseState } from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_COOKIE = "fluxentiq.trial";
const LICENSE_COOKIE = "fluxentiq.license";

/**
 * Reflects the instance's existing license/trial state into a cookie so the
 * middleware license gate lets a returning user through after sign-in.
 *
 * Unlike `/api/license/trial` (which *starts* a trial), this only *syncs* the
 * already-active state — a fresh instance with no license/trial reports
 * `needsActivation` so the caller can route the user to `/auth/license`.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const license = await getLicenseState();
    if (!license) {
      return NextResponse.json({ ok: false, needsActivation: true });
    }
    const cookie = license.tier === "TRIAL" ? TRIAL_COOKIE : LICENSE_COOKIE;
    const response = NextResponse.json({ ok: true, tier: license.tier });
    response.cookies.set(cookie, "valid", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 15,
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 },
    );
  }
}
