import { NextResponse } from "next/server";
import { activateLicense } from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LICENSE_COOKIE = "fluxentiq.license";
const TRIAL_COOKIE = "fluxentiq.trial";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { licenseKey?: string };
  const licenseKey = typeof body.licenseKey === "string" ? body.licenseKey : "";

  if (!licenseKey.trim()) {
    return NextResponse.json(
      { ok: false, message: "License key is required." },
      { status: 400 },
    );
  }

  try {
    const license = await activateLicense(licenseKey);
    const response = NextResponse.json({ ok: true, license });
    // Cookie signals activation to the edge middleware (cheap gate); the
    // authoritative check re-verifies from disk on every request.
    response.cookies.set(LICENSE_COOKIE, "valid", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: license.perpetual ? 60 * 60 * 24 * 365 : undefined,
    });
    // Upgrade: purge the trial cookie (Max-Age=0 with matching path/options)
    // so the trial gate can never re-activate over a paid license.
    response.cookies.set(TRIAL_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Activation failed." },
      { status: 400 },
    );
  }
}
