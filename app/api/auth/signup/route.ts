import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasSupabaseEnv, serverClient, adminClient } from "@/lib/supabase/server";
import { startTrial } from "@/lib/license";
import { attachOrganizationClaim } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_COOKIE = "fluxentiq.trial";
const LICENSE_COOKIE = "fluxentiq.license";

const SignupSchema = z.object({
  username: z.string().trim().min(1, "Username is required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters.").max(128),
});

/**
 * Server-side trial sign-up.
 *
 * Creates the user with email confirmation bypassed (the service-role admin
 * client sets `email_confirm: true`), signs them in to establish a session,
 * and starts the 15-day trial atomically — so a brand-new buyer lands on the
 * dashboard in one step, with no "check your email" dead-end.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid sign-up details.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
  const { username, email, password } = parsed.data;

  // Demo mode — no Supabase configured. Start the trial and let the client
  // continue to the (seed-data) dashboard.
  if (!hasSupabaseEnv()) {
    return finishWithLicense(NextResponse.json({ ok: true }));
  }

  try {
    const { data: created, error: createError } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: username },
    });

    if (createError || !created.user) {
      return NextResponse.json(
        { ok: false, message: createError?.message ?? "Could not create your account." },
        { status: 500 },
      );
    }

    // Pin the user's freshly-provisioned tenant (created by the
    // `handle_new_user` trigger) into app_metadata for claim-based RLS.
    await attachOrganizationClaim(created.user.id);

    // Establish a session for the freshly created (already-confirmed) user.
    const { error: signInError } = await serverClient().auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      return NextResponse.json(
        { ok: false, message: signInError.message },
        { status: 401 },
      );
    }

    return finishWithLicense(NextResponse.json({ ok: true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-up failed.";
    const alreadyRegistered = /already.*(registered|exists)/i.test(message);
    return NextResponse.json(
      {
        ok: false,
        message: alreadyRegistered
          ? "An account with this email already exists. Sign in instead."
          : message,
      },
      { status: alreadyRegistered ? 409 : 500 },
    );
  }
}

/** Starts the trial and stamps the matching license/trial cookie. */
async function finishWithLicense(response: NextResponse): Promise<NextResponse> {
  try {
    const license = await startTrial();
    const cookie = license.tier === "TRIAL" ? TRIAL_COOKIE : LICENSE_COOKIE;
    response.cookies.set(cookie, "valid", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 15,
    });
  } catch {
    // Trial start is best-effort; the user still has a session.
  }
  return response;
}
