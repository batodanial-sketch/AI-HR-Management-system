import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import {
  denyMessage,
  selectCanonicalMembership,
  type AuthzDenyReason,
  type CanonicalMembership,
  type RawMembershipRow,
} from "@/lib/authz/model";

/**
 * THE canonical server-side authorization resolver.
 *
 *   actor (Supabase auth session)
 *     → memberships rows for that actor (RLS-scoped, user_id = auth.uid())
 *     → exactly one authoritative membership (see selectCanonicalMembership)
 *     → canonical role code + RBAC tier
 *
 * Properties:
 *   1. The actor comes from `auth.getUser()` — a verified session, never a
 *      client-supplied id.
 *   2. The organization comes from the membership row — never from a header,
 *      body, cookie or model output. When a user holds several memberships
 *      the tie-break is the server-written `app_metadata.organization_id`
 *      claim (set by `attachOrganizationClaim`); `user_metadata` (client
 *      writable) is never consulted.
 *   3. Missing / ambiguous / unknown-role memberships DENY. There is no
 *      default role.
 *   4. The result is memoized per request with React `cache` so every
 *      consumer (RBAC, actions, copilot tools, audit) sees the same answer.
 *
 * Every other module must obtain authorization through this resolver (or
 * `lib/rbac.ts`, which is built on it). Direct reads of `memberships` /
 * `organization_memberships` / `roles` for authorization purposes are
 * forbidden and enforced by `scripts/authz-duplicate-check.mjs`.
 */

export interface AuthenticatedActor {
  id: string;
  email: string;
  fullName: string;
}

export type CanonicalAuthzContext =
  | { ok: true; actor: AuthenticatedActor; membership: CanonicalMembership }
  | { ok: false; actor: AuthenticatedActor | null; reason: AuthzDenyReason; detail?: string };

export class AuthzDeniedError extends Error {
  readonly code = "AUTHZ_DENIED";
  readonly reason: AuthzDenyReason;
  constructor(reason: AuthzDenyReason, detail?: string) {
    super(denyMessage(reason));
    this.name = "AuthzDeniedError";
    this.reason = reason;
    if (detail && process.env.NODE_ENV !== "production") {
      this.message = `${this.message} (${detail})`;
    }
  }
}

function serverPinnedOrganization(appMetadata: unknown): string | null {
  if (!appMetadata || typeof appMetadata !== "object") return null;
  const value = (appMetadata as Record<string, unknown>).organization_id;
  return typeof value === "string" ? value : null;
}

/**
 * Resolves the canonical authorization context for the current request.
 * Never throws for authorization outcomes — returns `{ ok: false }` so
 * callers can choose their own failure shape (403 JSON, ActionResponse, …).
 */
export const resolveCanonicalAuthz = cache(async (): Promise<CanonicalAuthzContext> => {
  if (!hasSupabaseEnv()) {
    return { ok: false, actor: null, reason: "RESOLVER_ERROR", detail: "supabase not configured" };
  }

  let supabase: ReturnType<typeof serverClient>;
  try {
    supabase = serverClient();
  } catch (error) {
    return {
      ok: false,
      actor: null,
      reason: "RESOLVER_ERROR",
      detail: error instanceof Error ? error.message : "client init failed",
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, actor: null, reason: "UNAUTHENTICATED" };
  }

  const actor: AuthenticatedActor = {
    id: user.id,
    email: user.email ?? "",
    fullName:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : user.email ?? "User",
  };

  // Authoritative membership rows. RLS (`memberships_select`) already limits
  // this to the caller's own rows; the explicit filter is defense in depth and
  // `selectCanonicalMembership` re-verifies user_id on every row.
  const { data, error } = await supabase
    .from("memberships")
    .select("id, user_id, organization_id, role")
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, actor, reason: "RESOLVER_ERROR", detail: error.message };
  }

  const resolution = selectCanonicalMembership({
    userId: user.id,
    rows: (data ?? []) as unknown as RawMembershipRow[],
    activeOrganizationId: serverPinnedOrganization(user.app_metadata),
  });

  if (!resolution.ok) {
    return { ok: false, actor, reason: resolution.reason, detail: resolution.detail };
  }
  return { ok: true, actor, membership: resolution.membership };
});

/** Resolves the canonical context or throws {@link AuthzDeniedError}. */
export async function requireCanonicalAuthz(): Promise<
  Extract<CanonicalAuthzContext, { ok: true }>
> {
  const ctx = await resolveCanonicalAuthz();
  if (!ctx.ok) throw new AuthzDeniedError(ctx.reason, ctx.detail);
  return ctx;
}
