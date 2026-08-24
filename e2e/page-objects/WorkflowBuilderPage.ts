import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for the visual workflow builder.
 *
 * Route:   /workflows/builder
 *
 * Contract (data-testid):
 *   workflow-canvas            — the node canvas (drop target)
 *   workflow-palette-item      — palette item (data-node-type)
 *   workflow-node              — a canvas node (data-node-type)
 *   workflow-trigger-config    — trigger configuration panel
 *   workflow-trigger-event     — event selector (data-event)
 *   workflow-save-button       — save control
 *   workflow-saved-indicator   — confirmation state
 */
export type WorkflowNodeType = "trigger" | "action" | "condition" | "delay";

export class WorkflowBuilderPage extends BasePage {
  private readonly canvas: Locator;
  private readonly triggerConfig: Locator;
  private readonly triggerEventSelect: Locator;
  private readonly saveButton: Locator;
  private readonly savedIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.canvas = this.getByTestId("workflow-canvas");
    this.triggerConfig = this.getByTestId("workflow-trigger-config");
    this.triggerEventSelect = this.getByTestId("workflow-trigger-event");
    this.saveButton = this.getByTestId("workflow-save-button");
    this.savedIndicator = this.getByTestId("workflow-saved-indicator");
  }

  override async goto(): Promise<void> {
    await super.goto("/workflows/builder");
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await this.waitForAppReady();
    await expect(this.canvas).toBeVisible();
  }

  private paletteItem(nodeType: WorkflowNodeType): Locator {
    return this.page.locator(
      `[data-testid="workflow-palette-item"][data-node-type="${nodeType}"]`,
    );
  }

  private canvasNode(nodeType: WorkflowNodeType): Locator {
    return this.page.locator(
      `[data-testid="workflow-node"][data-node-type="${nodeType}"]`,
    );
  }

  /** Drags a palette item onto the canvas and asserts the node was created. */
  async dragNodeToCanvas(nodeType: WorkflowNodeType): Promise<void> {
    const source = this.paletteItem(nodeType);
    await expect(source).toBeVisible();
    await source.dragTo(this.canvas);
    await expect(this.canvasNode(nodeType).first()).toBeVisible();
  }

  /** Asserts a node of the given type is present on the canvas. */
  async expectNodeOnCanvas(nodeType: WorkflowNodeType): Promise<void> {
    await expect(this.canvasNode(nodeType).first()).toBeVisible();
  }

  async configureTrigger(event: string): Promise<void> {
    await expect(this.triggerConfig).toBeVisible();
    await this.triggerEventSelect.selectOption(event);
  }

  async expectTriggerEvent(event: string): Promise<void> {
    await expect(this.triggerEventSelect).toHaveValue(event);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.savedIndicator).toBeVisible();
  }

  async expectSaved(): Promise<void> {
    await expect(this.savedIndicator).toBeVisible();
  }
}
