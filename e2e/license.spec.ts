import { expect, test } from "@playwright/test";

/**
 * Onboarding & license activation flow.
 *
 * Verifies that clicking "Continue with 15-Day Free Trial" starts the trial,
 * persists the `fluxentiq.trial` httpOnly cookie, and routes cleanly off the
 * activation screen with no redirect loop back to `/auth/license`.
 *
 * Runs unauthenticated (clears the global storageState) so the trial CTA is
 * exercised from the exact state a brand-new buyer sees.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("License activation / free trial", () => {
  test("Continue with 15-Day Free Trial sets the trial cookie and never loops", async ({
    page,
    context,
  }) => {
    await page.goto("/auth/license");

    const trialButton = page.getByTestId("continue-trial-btn");
    await expect(trialButton).toBeVisible();
    await trialButton.click();

    // The trial is started BEFORE the redirect: the httpOnly cookie is stamped
    // by POST /api/license/trial so the middleware license gate lets the user
    // through on the very next navigation.
    await expect
      .poll(
        async () => {
          const cookies = await context.cookies();
          return cookies.find((cookie) => cookie.name === "fluxentiq.trial")?.value;
        },
        { timeout: 10_000 },
      )
      .toBe("valid");

    // No bounce loop: we leave /auth/license and never return to it. With a
    // session the user lands on /dashboard; a brand-new (session-less) visitor
    // is routed to /login by the auth gate — either way, NOT /auth/license.
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/license"));
    expect(page.url()).not.toContain("/auth/license");
  });

  test("license key input is present and suppresses autofill", async ({ page }) => {
    await page.goto("/auth/license");

    const input = page.getByTestId("license-input-field");
    await expect(input).toBeVisible();

    // Browser autofill suppression attributes (Chrome / 1Password / LastPass).
    await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).toHaveAttribute("data-1p-ignore", "true");
    await expect(input).toHaveAttribute("data-lpignore", "true");
    await expect(input).toHaveAttribute("aria-autocomplete", "none");
  });
});
