import {
  type APIRequestContext,
  type Page,
  type Route,
} from "@playwright/test";

/**
 * Google Workspace SSO decision paths + access-request API helpers.
 *
 * The six decision paths mirror the provisioning rules encoded in
 * `20260815000400_google_workspace_access_requests.sql`:
 *
 *   - existing_membership_allowed   → user already a member; sign in.
 *   - invited_membership_activated  → pending invite activated on first sign-in.
 *   - membership_required           → verified domain but no membership;
 *                                     must request access (pending state).
 *   - domain_not_provisioned        → domain not provisioned for the workspace.
 *   - personal_account_blocked      → personal (gmail) account rejected.
 *   - ambiguous_domain_blocked      → domain ownership cannot be resolved.
 *
 * Because the Google OAuth round-trip is external, the callback endpoint is
 * mocked via page.route(); the application's internal rules (DB-backed) are
 * exercised against the real Supabase instance through the request helpers.
 */

export type WorkspaceDecisionPath =
  | "existing_membership_allowed"
  | "invited_membership_activated"
  | "membership_required"
  | "domain_not_provisioned"
  | "personal_account_blocked"
  | "ambiguous_domain_blocked";

export interface SsoCallbackResponse {
  decision: WorkspaceDecisionPath;
  email: string;
  domain: string;
  message: string;
  redirectTo: string | null;
}

export interface AccessRequestResponse {
  id: string;
  email: string;
  domain: string;
  status: "pending";
  token: string | null;
}

export interface CompleteAccessRequestResponse {
  status: "activated" | "invalid";
  email: string | null;
}

export const SSO_CALLBACK_PATH = "/api/auth/sso-callback";
export const REQUEST_ACCESS_PATH = "/api/auth/request-access";
export const COMPLETE_ACCESS_PATH = "/api/auth/complete-access-request";

export function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? "http://localhost:3000";
}

const DECISION_BODIES: Record<
  WorkspaceDecisionPath,
  { message: string; redirectTo: string | null }
> = {
  existing_membership_allowed: {
    message: "Existing membership verified.",
    redirectTo: "/dashboard",
  },
  invited_membership_activated: {
    message: "Pending invite activated.",
    redirectTo: "/dashboard",
  },
  membership_required: {
    message: "Access requires approval for this domain.",
    redirectTo: null,
  },
  domain_not_provisioned: {
    message: "This domain is not provisioned for Google Workspace access.",
    redirectTo: null,
  },
  personal_account_blocked: {
    message: "Personal accounts are not permitted. Use your company account.",
    redirectTo: null,
  },
  ambiguous_domain_blocked: {
    message: "Domain ownership could not be verified.",
    redirectTo: null,
  },
};

/**
 * Intercepts the SSO callback and returns a canned decision, letting specs
 * exercise every decision path deterministically without contacting Google.
 */
export async function mockSsoDecision(
  page: Page,
  decision: WorkspaceDecisionPath,
  email: string,
  domain: string,
): Promise<void> {
  const body = DECISION_BODIES[decision];
  await page.route(`**${SSO_CALLBACK_PATH}`, async (route: Route) => {
    const payload: SsoCallbackResponse = {
      decision,
      email,
      domain,
      message: body.message,
      redirectTo: body.redirectTo,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

/**
 * Submits an access request on behalf of an uninvited, verified-domain user.
 * Targets POST /api/auth/request-access and returns the pending record.
 */
export async function submitAccessRequest(
  request: APIRequestContext,
  baseUrl: string,
  email: string,
  domain: string,
): Promise<AccessRequestResponse> {
  const response = await request.post(`${baseUrl}${REQUEST_ACCESS_PATH}`, {
    data: { email, domain },
  });
  if (!response.ok()) {
    throw new Error(
      `Access request failed with ${response.status()}: ${await response.text()}`,
    );
  }
  return (await response.json()) as AccessRequestResponse;
}

/**
 * Submits a signed access-request token to complete onboarding.
 * Targets POST /api/auth/complete-access-request.
 */
export async function completeAccessRequest(
  request: APIRequestContext,
  baseUrl: string,
  token: string,
): Promise<CompleteAccessRequestResponse> {
  const response = await request.post(`${baseUrl}${COMPLETE_ACCESS_PATH}`, {
    data: { token },
  });
  if (!response.ok()) {
    throw new Error(
      `Token submission failed with ${response.status()}: ${await response.text()}`,
    );
  }
  return (await response.json()) as CompleteAccessRequestResponse;
}
