import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { resolveCanonicalAuthz } from "@/lib/authz/canonical";
import {
  RB_ROLES,
  ROLE_HIERARCHY,
  roleAtLeast,
  tierForRoleCode,
  type CanonicalRoleCode,
  type RbRole,
} from "@/lib/authz/model";
import type { OrgRole } from "@/lib/types";

export type { OrgRole };

/**
 * Session identity surfaced to server components + server actions.
 *
 * `organizationId` and `role` are populated ONLY from the canonical
 * membership resolver (`lib/authz/canonical.ts`). When the caller has no
 * valid canonical membership both are `null` — there is no fallback to a
 * pinned claim, a legacy table, or a default role.
 */
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

/** Anonymous identity used when Supabase is configured but no session exists. */
const ANONYMOUS_USER: SessionUser = {
  id: "",
  email: "",
  fullName: "Guest",
  organizationId: null,
  role: null,
};

/**
 * Returns the authenticated user with their canonical organization membership.
 * Falls back to a demo identity ONLY when Supabase is not configured at all
 * (local preview). With Supabase configured, an unauthenticated request
 * resolves to an anonymous identity with no organization and no role.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  if (!hasSupabaseEnv()) {
    return DEMO_USER;
  }

  const authz = await resolveCanonicalAuthz();
  if (!authz.actor) {
    return ANONYMOUS_USER;
  }

  const base: SessionUser = {
    id: authz.actor.id,
    email: authz.actor.email,
    fullName: authz.actor.fullName,
    organizationId: null,
    role: null,
  };
  if (!authz.ok) return base;

  return {
    ...base,
    organizationId: authz.membership.organizationId,
    role: authz.membership.roleCode,
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

/** Returns true when the user holds an admin-or-higher canonical role. */
export function isAdmin(user: SessionUser): boolean {
  return user.role === "owner" || user.role === "admin";
}

/** True when the user can approve/reject (owner, admin, manager). */
export function canApprove(user: SessionUser): boolean {
  return (
    user.role === "owner" || user.role === "admin" || user.role === "manager"
  );
}

/* ------------------------------------------------------------------ */
/* Enterprise SSO (SAML 2.0 / OIDC)                                   */
/* ------------------------------------------------------------------ */

/** Supported enterprise identity providers. */
export type SsoProviderId = "google" | "okta" | "azure";

/**
 * Normalizes a user-supplied provider string onto the supported set.
 * Unknown values return null (fail closed).
 */
export function normalizeSsoProvider(raw: string | null | undefined): SsoProviderId | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "google" || value === "google-workspace" || value === "workspace") {
    return "google";
  }
  if (value === "okta" || value === "saml") return "okta";
  if (value === "azure" || value === "azuread" || value === "microsoft" || value === "entra") {
    return "azure";
  }
  return null;
}

/**
 * Infers the likely IdP from an email domain (for domain-first SSO logins).
 */
export function ssoProviderForDomain(domain: string | null | undefined): SsoProviderId | null {
  const host = (domain ?? "").trim().toLowerCase();
  if (!host) return null;
  if (host.endsWith("okta.com") || host.endsWith("oktapreview.com")) return "okta";
  if (host.endsWith("onmicrosoft.com") || host.endsWith("microsoft.com")) return "azure";
  if (host === "gmail.com" || host === "googlemail.com" || host === "google.com") return "google";
  return null;
}

/** Maps a supported provider onto Supabase's `signInWithSSO` provider id. */
function supabaseSsoProviderId(provider: SsoProviderId): string {
  if (provider === "google") {
    // Google Workspace is a hosted OIDC provider — the stable provider id.
    return "google";
  }
  // Okta + Azure AD are SAML 2.0 apps. The provider id is the SAML
  // provider's UUID as configured in the Supabase dashboard (Auth → SSO),
  // supplied via env so it is never hard-coded per tenant.
  const envId =
    provider === "okta"
      ? process.env.SUPABASE_SSO_OKTA_PROVIDER_ID
      : process.env.SUPABASE_SSO_AZURE_PROVIDER_ID;
  if (!envId) {
    throw new Error(
      `SAML SSO for ${provider} is not configured — set ${
        provider === "okta" ? "SUPABASE_SSO_OKTA_PROVIDER_ID" : "SUPABASE_SSO_AZURE_PROVIDER_ID"
      } to the provider UUID from the Supabase dashboard.`,
    );
  }
  return envId;
}

/**
 * Initiates an SSO login flow via Supabase Auth and returns the
 * provider-hosted authorization URL. The caller redirects the browser there;
 * Supabase's callback lands on `/auth/callback` with the session.
 */
export async function initiateSsoLogin(input: {
  provider?: string | null;
  domain?: string | null;
  redirectTo?: string | null;
  captchaToken?: string | null;
}): Promise<{ url: string; provider: SsoProviderId }> {
  if (!hasSupabaseEnv()) {
    throw new Error("SSO is unavailable — Supabase is not configured.");
  }

  const provider =
    normalizeSsoProvider(input.provider) ??
    ssoProviderForDomain(input.domain) ??
    null;

  // Redirect targets are restricted to same-origin paths — an attacker
  // controlling `redirectTo` must never be able to exfiltrate the session.
  let redirectTo = "/dashboard";
  if (input.redirectTo && input.redirectTo.startsWith("/") && !input.redirectTo.startsWith("//")) {
    redirectTo = input.redirectTo;
  }
  const options = {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${redirectTo}`,
    skipBrowserRedirect: true,
    ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
  };

  const supabase = serverClient();

  if (input.domain && !input.provider) {
    // Domain-first SSO: Supabase resolves the IdP from the organization's
    // DNS records — the standard enterprise flow for Okta/Azure/Google.
    if (!provider) {
      throw new Error(
        "Unknown SSO provider. Supported: google (Google Workspace), okta, azure (Microsoft Entra ID).",
      );
    }
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: input.domain,
      options,
    });
    if (error || !data?.url) {
      throw new Error(error?.message ?? "The identity provider did not return an authorization URL.");
    }
    return { url: data.url, provider };
  }

  if (!provider) {
    throw new Error(
      "Unknown SSO provider. Supported: google (Google Workspace), okta, azure (Microsoft Entra ID).",
    );
  }

  const { data, error } = await supabase.auth.signInWithSSO({
    providerId: supabaseSsoProviderId(provider),
    options,
  });
  if (error || !data?.url) {
    throw new Error(error?.message ?? "The identity provider did not return an authorization URL.");
  }
  return { url: data.url, provider };
}

/* ------------------------------------------------------------------ */
/* RBAC role model (tenant-scoped)                                    */
/* ------------------------------------------------------------------ */

/**
 * Re-exported from the canonical model so existing imports keep working.
 * The mapping canonical role code → tier lives in `lib/authz/model.ts` and
 * nowhere else.
 */
export { RB_ROLES, ROLE_HIERARCHY, roleAtLeast };
export type { RbRole, CanonicalRoleCode };

/**
 * Maps a canonical role code onto its RBAC tier. Accepts only exact
 * canonical codes; anything else returns `null` (callers must deny).
 */
export function tierForCanonicalRole(role: OrgRole | null | undefined): RbRole | null {
  return role ? tierForRoleCode(role) : null;
}
