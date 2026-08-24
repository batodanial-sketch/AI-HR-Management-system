import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for the authentication surface.
 *
 * Route:   /login
 * Contract (data-testid):
 *   auth-email-input     — email field
 *   auth-password-input  — password field
 *   auth-submit-button   — submit control
 *   auth-error-message   — inline error banner (visible on failed sign-in)
 *   auth-magic-link-button — optional passwordless entry point
 */
export class AuthPage extends BasePage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly submitButton: Locator;
  private readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = this.getByTestId("auth-email-input");
    this.passwordInput = this.getByTestId("auth-password-input");
    this.submitButton = this.getByTestId("auth-submit-button");
    this.errorMessage = this.getByTestId("auth-error-message");
  }

  override async goto(): Promise<void> {
    await super.goto("/login");
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Complete sign-in and wait for navigation to the authenticated app. */
  async login(email: string, password: string): Promise<void> {
    await this.fillCredentials(email, password);
    await this.submit();
    await this.page.waitForURL((url) => !url.pathname.includes("/login"));
  }

  /** Submits credentials and surfaces the rendered error for assertions. */
  async loginExpectingFailure(
    email: string,
    password: string,
  ): Promise<string> {
    await this.fillCredentials(email, password);
    await this.submit();
    await expect(this.errorMessage).toBeVisible();
    return (await this.errorMessage.textContent())?.trim() ?? "";
  }

  async expectErrorContaining(text: string): Promise<void> {
    await expect(this.errorMessage).toContainText(text);
  }

  /* ---------------- Google Workspace SSO surface ---------------- */

  private readonly googleButton: Locator = this.getByTestId("sso-google-button");
  private readonly accessRequestPrompt: Locator = this.getByTestId(
    "auth-access-request-prompt",
  );
  private readonly requestAccessButton: Locator = this.getByTestId(
    "auth-request-access-button",
  );
  private readonly pendingBadge: Locator = this.getByTestId(
    "auth-access-request-pending",
  );
  private readonly blockedMessage: Locator = this.getByTestId("auth-blocked-message");

  /** Clicks the "Continue with Google" entry point (SSO flow). */
  async continueWithGoogle(): Promise<void> {
    await this.googleButton.click();
  }

  /** Asserts the access-request prompt is shown (membership_required path). */
  async expectAccessRequestPrompt(): Promise<void> {
    await expect(this.accessRequestPrompt).toBeVisible();
    await expect(this.requestAccessButton).toBeVisible();
  }

  /** Submits an access request from the prompt and awaits the pending state. */
  async requestAccess(): Promise<void> {
    await this.requestAccessButton.click();
    await expect(this.pendingBadge).toBeVisible();
  }

  /** Asserts the pending-access state is rendered. */
  async expectPendingAccessRequest(): Promise<void> {
    await expect(this.pendingBadge).toBeVisible();
  }

  /** Asserts a blocked SSO message (decision paths that deny access). */
  async expectBlockedMessage(text: string): Promise<void> {
    await expect(this.blockedMessage).toBeVisible();
    await expect(this.blockedMessage).toContainText(text);
  }
}
