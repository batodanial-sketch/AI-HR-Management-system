import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for the Groq AI Copilot drawer.
 *
 * The drawer is reachable from any authenticated page via the floating
 * trigger. It is not a route of its own.
 *
 * Contract (data-testid):
 *   copilot-trigger-button — floating launch control
 *   copilot-drawer         — the drawer panel
 *   copilot-input          — query textarea
 *   copilot-send-button    — submit control
 *   copilot-message        — a chat message (data-role ∈ {user, assistant})
 *   copilot-action-card    — a structured action card
 *   copilot-close-button   — close control
 */
export class CopilotPage extends BasePage {
  private readonly triggerButton: Locator;
  private readonly drawer: Locator;
  private readonly input: Locator;
  private readonly sendButton: Locator;
  private readonly closeButton: Locator;

  constructor(page: Page) {
    super(page);
    this.triggerButton = this.getByTestId("copilot-trigger-button");
    this.drawer = this.getByTestId("copilot-drawer");
    this.input = this.getByTestId("copilot-input");
    this.sendButton = this.getByTestId("copilot-send-button");
    this.closeButton = this.getByTestId("copilot-close-button");
  }

  async open(): Promise<void> {
    await this.triggerButton.click();
    await expect(this.drawer).toBeVisible();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    await expect(this.drawer).toBeHidden();
  }

  async sendQuery(query: string): Promise<void> {
    await this.input.fill(query);
    await this.sendButton.click();
  }

  /** Asserts a user message and an assistant reply are both rendered. */
  async expectConversationTurn(): Promise<void> {
    await expect(
      this.drawer.locator('[data-testid="copilot-message"][data-role="user"]'),
    ).toBeVisible();
    await expect(
      this.drawer.locator('[data-testid="copilot-message"][data-role="assistant"]'),
    ).toBeVisible();
  }

  /** Asserts the assistant's reply contains the expected text. */
  async expectAssistantText(text: string): Promise<void> {
    const reply = this.drawer
      .locator('[data-testid="copilot-message"][data-role="assistant"]')
      .filter({ hasText: text })
      .first();
    await expect(reply).toBeVisible();
  }

  /** Asserts at least one structured action card is rendered. */
  async expectActionCard(title?: string): Promise<void> {
    const card = title
      ? this.drawer
          .locator('[data-testid="copilot-action-card"]')
          .filter({ hasText: title })
          .first()
      : this.drawer.locator('[data-testid="copilot-action-card"]').first();
    await expect(card).toBeVisible();
  }
}
