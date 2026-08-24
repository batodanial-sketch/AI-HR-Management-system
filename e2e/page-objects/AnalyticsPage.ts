import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for the analytics dashboard, used by the visual-regression
 * suite to pin stable chart surfaces before pixel comparisons.
 *
 * Route:   /analytics
 *
 * Contract (data-testid):
 *   analytics-dashboard      — root analytics container
 *   analytics-chart-{key}    — a chart panel; key ∈ {headcount, attrition,
 *                              payroll, leave, recruitment}
 */
export type AnalyticsChartKey =
  | "headcount"
  | "attrition"
  | "payroll"
  | "leave"
  | "recruitment";

export class AnalyticsPage extends BasePage {
  private readonly dashboard: Locator;

  constructor(page: Page) {
    super(page);
    this.dashboard = this.getByTestId("analytics-dashboard");
  }

  override async goto(): Promise<void> {
    await super.goto("/analytics");
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await this.waitForAppReady();
    await expect(this.dashboard).toBeVisible();
  }

  async expectChartVisible(key: AnalyticsChartKey): Promise<void> {
    await expect(this.getByTestId(`analytics-chart-${key}`)).toBeVisible();
  }

  /** Asserts every standard chart panel has finished rendering. */
  async expectAllChartsLoaded(): Promise<void> {
    const keys: AnalyticsChartKey[] = [
      "headcount",
      "attrition",
      "payroll",
      "leave",
      "recruitment",
    ];
    for (const key of keys) {
      await this.expectChartVisible(key);
    }
  }
}
