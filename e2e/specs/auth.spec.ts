import { expect, test } from "../fixtures/customTest";
import { createAdminClient } from "../utils/supabase-test-seed";
import { cleanupWorkspaceData, seedWorkspaceData } from "../utils/domain-seed";
import {
  completeAccessRequest,
  getBaseUrl,
  mockSsoDecision,
  submitAccessRequest,
  type WorkspaceDecisionPath,
} from "../utils/google-workspace";

/**
 * Authentication + Google Workspace SSO suite.
 *
 * Runs unauthenticated: the global storageState (a logged-in session) is
 * cleared for this spec so login and SSO decision paths start from a clean
 * state.
 *
 * Contract: the app exposes
 *   - POST /api/auth/sso-callback   returning SsoCallbackResponse
 *   - POST /api/auth/request-access returning AccessRequestResponse
 *   - POST /api/auth/complete-access-request returning CompleteAccessRequestResponse
 * and renders the SSO outcome via the data-testid markers exercised below.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL = getBaseUrl();
const TEST_EMAIL = process.env.E2E_TEST_USER_EMAIL ?? "";
const TEST_PASSWORD = process.env.E2E_TEST_USER_PASSWORD ?? "";

test.describe("Credential login", () => {
  test("signs in with valid credentials", async ({ authPage, page }) => {
    await authPage.goto();
    await authPage.login(TEST_EMAIL, TEST_PASSWORD);
    await expect(page).toHaveURL(/dashboard/);
  });

  test("rejects invalid credentials", async ({ authPage }) => {
    await authPage.goto();
    await authPage.loginExpectingFailure(
      "nobody@fluxentiq.test",
      "definitely-wrong-password",
    );
    await authPage.expectErrorContaining("invalid");
  });
});

test.describe("Google Workspace SSO decision paths", () => {
  test.beforeAll(async () => {
    await seedWorkspaceData(createAdminClient());
  });

  test.afterAll(async () => {
    await cleanupWorkspaceData(createAdminClient());
  });

  test("existing_membership_allowed redirects to the dashboard", async ({
    authPage,
    page,
  }) => {
    await mockSsoDecision(
      page,
      "existing_membership_allowed",
      "member@fluxentiq.test",
      "fluxentiq.test",
    );
    await authPage.goto();
    await authPage.continueWithGoogle();
    await expect(page).toHaveURL(/dashboard/);
  });

  test("invited_membership_activated redirects to the dashboard", async ({
    authPage,
    page,
  }) => {
    await mockSsoDecision(
      page,
      "invited_membership_activated",
      "invited@fluxentiq.test",
      "fluxentiq.test",
    );
    await authPage.goto();
    await authPage.continueWithGoogle();
    await expect(page).toHaveURL(/dashboard/);
  });

  test("membership_required surfaces the access-request prompt", async ({
    authPage,
    page,
  }) => {
    await mockSsoDecision(
      page,
      "membership_required",
      "uninvited@fluxentiq.test",
      "fluxentiq.test",
    );
    await authPage.goto();
    await authPage.continueWithGoogle();
    await authPage.expectAccessRequestPrompt();
  });

  const blockedCases: Array<{
    decision: WorkspaceDecisionPath;
    email: string;
    domain: string;
    expected: string;
  }> = [
    {
      decision: "domain_not_provisioned",
      email: "user@blocked.test",
      domain: "blocked.test",
      expected: "not provisioned",
    },
    {
      decision: "personal_account_blocked",
      email: "person@gmail.com",
      domain: "gmail.com",
      expected: "Personal accounts",
    },
    {
      decision: "ambiguous_domain_blocked",
      email: "user@ambiguous.test",
      domain: "ambiguous.test",
      expected: "could not be verified",
    },
  ];

  for (const blocked of blockedCases) {
    test(`${blocked.decision} blocks access`, async ({ authPage, page }) => {
      await mockSsoDecision(page, blocked.decision, blocked.email, blocked.domain);
      await authPage.goto();
      await authPage.continueWithGoogle();
      await authPage.expectBlockedMessage(blocked.expected);
    });
  }
});

test.describe("Access requests", () => {
  test.beforeAll(async () => {
    await seedWorkspaceData(createAdminClient());
  });

  test.afterAll(async () => {
    await cleanupWorkspaceData(createAdminClient());
  });

  test("uninvited verified-domain user triggers a pending access request", async ({
    authPage,
    page,
    request,
  }) => {
    await mockSsoDecision(
      page,
      "membership_required",
      "uninvited@fluxentiq.test",
      "fluxentiq.test",
    );
    await authPage.goto();
    await authPage.continueWithGoogle();
    await authPage.expectAccessRequestPrompt();
    await authPage.requestAccess();

    const created = await submitAccessRequest(
      request,
      BASE_URL,
      "uninvited@fluxentiq.test",
      "fluxentiq.test",
    );
    expect(created.status).toBe("pending");
    expect(created.token).toBeNull();

    const admin = createAdminClient();
    const { data } = await admin
      .from("access_requests")
      .select("id, status")
      .eq("email", "uninvited@fluxentiq.test")
      .eq("source_tag", "e2e")
      .single();
    expect(data?.status).toBe("pending");
  });

  test("signed access-request token submission activates the account", async ({
    request,
  }) => {
    const activated = await completeAccessRequest(
      request,
      BASE_URL,
      "e2e-signed-token-123",
    );
    expect(activated.status).toBe("activated");
    expect(activated.email).toBe("approved@fluxentiq.test");

    const invalid = await completeAccessRequest(
      request,
      BASE_URL,
      "definitely-invalid-token",
    );
    expect(invalid.status).toBe("invalid");
  });
});
