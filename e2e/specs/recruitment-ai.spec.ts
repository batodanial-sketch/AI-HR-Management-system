import { expect, test } from "../fixtures/customTest";
import { createAdminClient } from "../utils/supabase-test-seed";
import { mockAiEvaluation } from "../utils/ai-mocks";

/**
 * Recruitment kanban + Groq AI evaluation suite. Candidates are seeded by
 * global-setup (e2e-cand-001..003) against the e2e-software-engineer-posting.
 */
test.describe("Recruitment kanban", () => {
  test("moves a candidate across stages and triggers an AI evaluation", async ({
    recruitmentKanbanPage,
    page,
  }) => {
    await mockAiEvaluation(page, {
      candidateName: "E2E CandidateOne",
      score: 82,
      summary: "Strong backend fundamentals; screen for final round.",
      recommendation: "advance",
    });

    await recruitmentKanbanPage.goto();
    await recruitmentKanbanPage.expectCandidateInStage("E2E CandidateOne", "applied");

    await recruitmentKanbanPage.dragCardToStage("E2E CandidateOne", "screening");
    await recruitmentKanbanPage.expectCandidateInStage(
      "E2E CandidateOne",
      "screening",
    );
    await recruitmentKanbanPage.expectAiEvaluationCard("E2E CandidateOne");

    await recruitmentKanbanPage.dragCardToStage("E2E CandidateOne", "interview");
    await recruitmentKanbanPage.expectCandidateInStage(
      "E2E CandidateOne",
      "interview",
    );
  });

  test("verifies seeded stage distribution", async ({ recruitmentKanbanPage }) => {
    await recruitmentKanbanPage.goto();
    await recruitmentKanbanPage.expectCardCount("applied", 1);
    await recruitmentKanbanPage.expectCardCount("interview", 1);
    await recruitmentKanbanPage.expectCardCount("offer", 1);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("candidates")
      .select("stage")
      .eq("source_tag", "e2e");
    if (error) {
      throw new Error(`Candidate query failed: ${error.message}`);
    }
    const stages = (data ?? []).map((row) => row.stage).sort();
    expect(stages).toEqual(["applied", "interview", "offer"]);
  });
});
