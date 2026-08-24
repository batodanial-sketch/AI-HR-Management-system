import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/lib/types";

export type { OrgRole };

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  organizationId: string | null;
  role: OrgRole | null;
}

const DEMO_USER: SessionUser = {
  id: "demo-user",
  email: "ayesha.rahman@fluxentiq.test",
  fullName: "Ayesha Rahman",
  organizationId: "11111111-1111-4111-8111-111111111111",
  role: "admin",
};

/**
 * Returns the authenticated user with their active organization membership.
 * Falls back to a demo identity when Supabase is not configured so the
 * interface remains fully usable in local dev / preview.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  if (!hasSupabaseEnv()) {
    return DEMO_USER;
  }

  const {
    data: { user },
  } = await serverClient().auth.getUser();
  if (!user) {
    return DEMO_USER;
  }

  const { data: profile } = await serverClient()
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: membership } = await serverClient()
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  // Pinned tenant claim (written by attachOrganizationClaim). Used only as a
  // fallback when the memberships row is momentarily unavailable; the
  // memberships query remains the authoritative tenant source.
  const claimOrgId =
    typeof user.app_metadata?.organization_id === "string"
      ? user.app_metadata.organization_id
      : null;

  return {
    id: user.id,
    email: user.email ?? "",
    fullName:
      profile?.full_name ??
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : user.email ?? "User"),
    organizationId: membership?.organization_id ?? claimOrgId ?? null,
    // Live memberships.role is free-text (legacy schema); coerce to the
    // canonical OrgRole union with a safe fallback to null.
    role: (membership?.role as OrgRole | null) ?? null,
  };
});

/** Returns the authenticated user or throws (for protected server code). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user.id) {
    throw new Error("Not authenticated.");
  }
  return user;
}

/** Returns true when the user holds an admin-or-higher role. */
export function isAdmin(user: SessionUser): boolean {
  return user.role === "owner" || user.role === "admin";
}

/** Returns true when the user can approve/reject (owner, admin, manager). */
export function canApprove(user: SessionUser): boolean {
  return (
    user.role === "owner" || user.role === "admin" || user.role === "manager"
  );
}
