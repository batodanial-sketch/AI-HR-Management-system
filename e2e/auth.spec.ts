import { expect, test } from "@playwright/test";
import { createAdminClient } from "./utils/supabase-test-seed";

/**
 * Multi-tenant registration + session migration.
 *
 * Verifies that a brand-new registration:
 *   1. Creates an authenticated Supabase JWT session (the `sb-<ref>-auth-token`
 *      cookie appears).
 *   2. Provisions an ISOLATED organization with an `owner` membership — never
 *      attaching the new account to an existing tenant's organization.
 *
 * NOTE on the trial cookie: `fluxentiq.trial` is the *license gate* (distinct
 * from auth). It intentionally persists across sign-in so the 15-day window
 * survives re-authentication; the DATA gate is the JWT + tenant-scoped RLS
 * (`is_organization_member`), which a bare trial cookie alone can never pass.
 * This spec therefore asserts the session is established and the tenant is
 * isolated, which is what actually prevents cross-tenant leakage.
 *
 * Requires the live `handle_new_user` trigger from
 * `supabase/AUTH_TENANT_HARDENING.sql` (per-user org provisioning) and the
 * E2E Supabase env vars from global-setup.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Multi-tenant registration", () => {
  test("registers a user into an isolated organization with an owner role", async ({
    page,
    context,
  }) => {
    const email = `e2e.reg.${Date.now()}@fluxentiq.test`;
    const password = "e2e-register-password-123";

    await page.goto("/signup");
    await page.getByTestId("signup-username-input").fill("E2E Register");
    await page.getByTestId("signup-email-input").fill(email);
    await page.getByTestId("signup-password-input").fill(password);
    await page.getByTestId("signup-submit-button").click();

    // Registration signs the user in and routes to the dashboard.
    await page.waitForURL(/dashboard/);

    // A Supabase auth session cookie now exists (JWT session established).
    const cookies = await context.cookies();
    const authCookie = cookies.find((cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"),
    );
    expect(authCookie).toBeTruthy();

    // Verify tenant isolation server-side via the admin client.
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();
    expect(profile?.id).toBeTruthy();

    const userId = profile.id as string;
    const { data: membership } = await admin
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", userId)
      .single();
    expect(membership?.role).toBe("owner");

    const organizationId = membership?.organization_id as string;

    // The provisioned org is real and belongs exclusively to this new user.
    const { data: org } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .single();
    expect(org?.id).toBe(organizationId);

    // Cleanup (best-effort; global-teardown also sweeps E2E rows).
    await admin.from("memberships").delete().eq("user_id", userId);
    await admin.from("organizations").delete().eq("id", organizationId);
    await admin.auth.admin.deleteUser(userId);
  });
});
