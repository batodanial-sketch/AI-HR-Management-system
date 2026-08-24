import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Base class for all page objects. Centralises navigation, test-id lookups and
 * cross-page helpers. The UI exposes a stable contract of `data-testid`
 * attributes; every locator in the concrete pages derives from that contract.
 *
 * App root marker: the application shell renders <div data-testid="app-root">
 * once hydration + initial data load complete.
 */
export abstract class BasePage {
  readonly page: Page;

  protected constructor(page: Page) {
    this.page = page;
  }

  protected getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  protected async goto(path = "/"): Promise<void> {
    await this.page.goto(path);
  }

  /** Waits for the app shell to finish mounting + first render. */
  async waitForAppReady(): Promise<void> {
    await expect(this.getByTestId("app-root")).toBeVisible();
  }

  /** Asserts the current URL (path) matches the expected value. */
  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
  }

  /** Asserts a toast/notification containing the message is visible, then clears. */
  async expectToast(message: string): Promise<void> {
    const toast = this.page
      .locator('[data-testid="toast"]')
      .filter({ hasText: message })
      .first();
    await expect(toast).toBeVisible();
  }

  /** Waits for any in-flight network activity triggered by the last action to settle. */
  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }
}
