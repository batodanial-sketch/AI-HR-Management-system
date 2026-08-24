import "server-only";
import { adminClient } from "@/lib/supabase/server";

/**
 * Tenant context — pins a user's active organization to Supabase `app_metadata`
 * so the claim is available to RLS policies and downstream consumers.
 *
 * The authoritative tenant source of truth remains the `memberships` row
 * (re-read via `is_organization_member` in RLS and via `getCurrentUser`).
 * `app_metadata.organization_id` is a forward-looking claim: Supabase does not
 * re-sign an in-flight JWT when metadata changes, so the claim takes effect on
 * the user's NEXT sign-in. It is written here so future sessions carry it and
 * so claim-based RLS (opt-in) works after re-auth.
 */

export async function attachOrganizationClaim(userId: string): Promise<string | null> {
  const admin = adminClient();

  // Resolve the tenant membership the trigger/route just provisioned.
  const { data: membership } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const organizationId =
    membership && typeof membership.organization_id === "string"
      ? membership.organization_id
      : null;

  if (organizationId) {
    // Merge with any existing app_metadata so we never clobber other claims.
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    const existingMeta =
      existing?.user?.app_metadata && typeof existing.user.app_metadata === "object"
        ? existing.user.app_metadata
        : {};
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...existingMeta, organization_id: organizationId },
    });
  }

  return organizationId;
}
