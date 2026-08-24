import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for the recruitment kanban board.
 *
 * Route:   /recruitment
 * Contract (data-testid):
 *   kanban-board          — board container
 *   kanban-column         — a single stage column; data-stage ∈
 *                           {applied, screening, interview, offer, hired}
 *   kanban-card           — a candidate card within a column
 *   kanban-add-candidate  — opens the add-candidate flow
 */
export class RecruitmentKanbanPage extends BasePage {
  private readonly board: Locator;
  private readonly addCandidateButton: Locator;

  constructor(page: Page) {
    super(page);
    this.board = this.getByTestId("kanban-board");
    this.addCandidateButton = this.getByTestId("kanban-add-candidate");
  }

  override async goto(): Promise<void> {
    await super.goto("/recruitment");
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await this.waitForAppReady();
    await expect(this.board).toBeVisible();
  }

  private column(stage: string): Locator {
    return this.getByTestId("kanban-column").filter({
      has: this.page.locator(`[data-stage="${stage}"]`),
    });
  }

  private cardsIn(stage: string): Locator {
    return this.column(stage).locator('[data-testid="kanban-card"]');
  }

  /** Number of candidate cards in a given stage column. */
  async getCardCount(stage: string): Promise<number> {
    return this.cardsIn(stage).count();
  }

  /** Asserts a candidate (by full name) sits in a given stage column. */
  async expectCandidateInStage(fullName: string, stage: string): Promise<void> {
    const card = this.cardsIn(stage).filter({ hasText: fullName }).first();
    await expect(card).toBeVisible();
  }

  /** Asserts a stage column holds exactly `count` cards. */
  async expectCardCount(stage: string, count: number): Promise<void> {
    await expect(this.cardsIn(stage)).toHaveCount(count);
  }

  async openAddCandidate(): Promise<void> {
    await this.addCandidateButton.click();
    await this.page.waitForURL(/\/recruitment\/new/);
  }

  /**
   * Drags a candidate card into the target stage column. Dragging across a
   * stage boundary triggers the Groq AI evaluation pipeline for that candidate.
   */
  async dragCardToStage(fullName: string, targetStage: string): Promise<void> {
    const card = this.getByTestId("kanban-card").filter({ hasText: fullName }).first();
    await expect(card).toBeVisible();
    const targetColumn = this.getByTestId("kanban-column").filter({
      has: this.page.locator(`[data-stage="${targetStage}"]`),
    });
    await card.dragTo(targetColumn);
    await this.waitForNetworkIdle();
  }

  /** Asserts a Groq AI evaluation card is rendered for the given candidate. */
  async expectAiEvaluationCard(fullName: string): Promise<void> {
    const evaluation = this.getByTestId("kanban-ai-evaluation")
      .filter({ hasText: fullName })
      .first();
    await expect(evaluation).toBeVisible();
  }
}
