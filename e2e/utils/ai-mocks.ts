import { type Page, type Route } from "@playwright/test";

/**
 * Deterministic mocks for the Groq-backed AI surfaces. The Copilot drawer and
 * the recruitment evaluation cards both depend on an external LLM; intercepting
 * the API keeps the E2E suite hermetic and repeatable while still exercising
 * the full client rendering path (loading state → response → action cards).
 */

export interface CopilotActionCard {
  title: string;
  kind: "navigate" | "approve" | "view";
  target: string;
}

export interface CopilotReply {
  text: string;
  actionCards: CopilotActionCard[];
}

export type Recommendation = "advance" | "hold" | "reject";

export interface AiEvaluation {
  candidateName: string;
  score: number;
  summary: string;
  recommendation: Recommendation;
}

export const COPILOT_ENDPOINT = "/api/ai/copilot";
export const EVALUATION_ENDPOINT = "/api/ai/evaluate-candidate";

/** Mocks a single Copilot response (text + optional action cards). */
export async function mockCopilotReply(
  page: Page,
  reply: CopilotReply,
): Promise<void> {
  await page.route(`**${COPILOT_ENDPOINT}`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(reply),
    });
  });
}

/** Mocks a Groq candidate evaluation triggered when a card changes stage. */
export async function mockAiEvaluation(
  page: Page,
  evaluation: AiEvaluation,
): Promise<void> {
  await page.route(`**${EVALUATION_ENDPOINT}`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(evaluation),
    });
  });
}
