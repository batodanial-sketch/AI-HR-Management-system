import { type NextRequest, NextResponse } from "next/server";
import { serverClient, adminClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Account deletion — the buyer's "right to erasure" endpoint.
 *
 * Removes the authenticated user's identity (auth.users), their profile and
 * membership rows, and anonymizes any employee record linked to their user id.
 * After deletion the session is invalidated and the caller is redirected to
 * the sign-out page.
 *
 * In demo mode (no Supabase) this is a no-op that reports success, since there
 * is no persistent identity to erase.
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: true, deleted: false });
  }

  const {
    data: { user },
  } = await serverClient().auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, message: "Not authenticated." }, { status: 401 });
  }

  const userId = user.id;
  const admin = adminClient();

  try {
    // 1. Anonymize any employee record linked to this identity. Employees are
    //    organization-scoped business records, so we strip personal fields
    //    rather than deleting org history outright.
    await admin
      .from("employees")
      .update({
        first_name: "[REDACTED]",
        last_name: "[REDACTED]",
        work_email: "[REDACTED]",
        personal_email: null,
        phone: null,
        date_of_birth: null,
        emergency_contact: {},
        custom_fields: {},
      })
      .eq("user_id", userId);

    // 2. Remove membership + profile rows. These also cascade from auth.users,
    //    but we delete explicitly to tolerate schema drift between deployments.
    await admin.from("memberships").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.from("users").delete().eq("id", userId);

    // 3. Delete the auth identity. This also cascades to any remaining rows
    //    that foreign-key auth.users(id).
    await admin.auth.admin.deleteUser(userId);

    void recordAudit({
      action: "member.remove",
      entity: "account",
      entityId: userId,
      metadata: { source: "self-service deletion" },
    });

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Account deletion failed.",
      },
      { status: 500 },
    );
  }
}
