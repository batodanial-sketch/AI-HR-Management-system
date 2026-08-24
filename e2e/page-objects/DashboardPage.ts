import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for the HR dashboard.
 *
 * Route:   /dashboard
 * Contract (data-testid):
 *   dashboard-stat-{key} — a metric card; key ∈ {employees, open-positions,
 *                          candidates, on-leave, pending-approvals}
 *   dashboard-recent-activity — the recent activity feed panel
 *   dashboard-quick-actions   — quick action button group
 */
export class DashboardPage extends BasePage {
  private readonly recentActivity: Locator;
  private readonly quickActions: Locator;

  constructor(page: Page) {
    super(page);
    this.recentActivity = this.getByTestId("dashboard-recent-activity");
    this.quickActions = this.getByTestId("dashboard-quick-actions");
  }

  override async goto(): Promise<void> {
    await super.goto("/dashboard");
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await this.waitForAppReady();
    await expect(this.recentActivity).toBeVisible();
    await expect(this.quickActions).toBeVisible();
  }

  private statLocator(key: string): Locator {
    return this.getByTestId(`dashboard-stat-${key}`);
  }

  /** Returns the rendered numeric value of a metric card. */
  async getStatValue(key: string): Promise<number> {
    const stat = this.statLocator(key);
    await expect(stat).toBeVisible();
    const raw = (await stat.getAttribute("data-value")) ?? "";
    const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(parsed)) {
      throw new Error(
        `Dashboard stat "${key}" has no parseable data-value (got "${raw}").`,
      );
    }
    return parsed;
  }

  /** Asserts a metric card is present and shows the expected value. */
  async expectStatValue(key: string, expected: number): Promise<void> {
    const value = await this.getStatValue(key);
    expect(value).toBe(expected);
  }
}
