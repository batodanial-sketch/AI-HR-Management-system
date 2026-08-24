import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { getLicenseState } from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_COOKIE = "fluxentiq.trial";
const LICENSE_COOKIE = "fluxentiq.license";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required.").max(128),
});

/**
 * Server-side password login.
 *
 * Signs the user in AND reflects the instance's license/trial state into a
 * cookie in the SAME response — atomically — so the middleware license gate
 * lets the user straight through to /dashboard on the next navigation, with no
 * reliance on a separate client-side sync fetch (which was the source of the
 * login → "/auth/license" bounce when that fetch's cookie didn't land in time).
 *
 * Mirrors the (already-working) `/api/auth/signup` pattern.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Enter a valid email and password." },
      { status: 400 },
    );
  }
  const { email, password } = parsed.data;

  // Demo mode — no Supabase configured. The client routes to the seed-data app.
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  try {
    // Establish the session server-side (sets the sb-<ref>-auth-token cookie).
    const { error: signInError } = await serverClient().auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return NextResponse.json({ ok: false, message: signInError.message }, { status: 401 });
    }

    // Reflect license/trial state into a cookie in this same response. A fresh
    // instance with no license/trial reports `needsActivation` so the client
    // routes to the activation screen instead of the app.
    const license = await getLicenseState();
    const response = NextResponse.json(
      license ? { ok: true } : { ok: true, needsActivation: true },
    );
    if (license) {
      const cookie = license.tier === "TRIAL" ? TRIAL_COOKIE : LICENSE_COOKIE;
      response.cookies.set(cookie, "valid", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 15,
      });
    }
    return response;
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Sign-in failed." },
      { status: 500 },
    );
  }
}
