import { expect, test } from "../fixtures/customTest";

/**
 * Visual regression suite: pixel-diff screenshot assertions for the dashboard
 * and analytics surfaces.
 *
 * Baselines live next to this file under __screenshots__ (generated on first
 * run with --update-snapshots, then committed). CI fails when the diff exceeds
 * maxDiffPixelRatio, which is tuned to tolerate sub-pixel font rendering.
 */
test.describe("Visual regression", () => {
  test("dashboard matches the golden baseline", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await expect(page).toHaveScreenshot("dashboard.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("analytics matches the golden baseline", async ({ page, analyticsPage }) => {
    await analyticsPage.goto();
    await analyticsPage.expectAllChartsLoaded();
    await expect(page).toHaveScreenshot("analytics.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
