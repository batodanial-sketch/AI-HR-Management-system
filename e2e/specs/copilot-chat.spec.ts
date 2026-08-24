import { test } from "../fixtures/customTest";
import { mockCopilotReply } from "../utils/ai-mocks";

/**
 * Groq AI Copilot drawer suite. The LLM response is mocked so the test is
 * hermetic; the client rendering path (drawer, messages, action cards) is
 * fully exercised.
 */
test.describe("Copilot chat", () => {
  test("opens the drawer, sends a query and renders action cards", async ({
    dashboardPage,
    copilotPage,
    page,
  }) => {
    await mockCopilotReply(page, {
      text: "You have 3 pending leave approvals and 2 open requisitions.",
      actionCards: [
        { title: "Review pending approvals", kind: "approve", target: "/leave" },
        { title: "Open requisitions", kind: "view", target: "/recruitment" },
      ],
    });

    await dashboardPage.goto();
    await copilotPage.open();

    await copilotPage.sendQuery("Show me pending approvals");
    await copilotPage.expectConversationTurn();
    await copilotPage.expectAssistantText("3 pending leave approvals");
    await copilotPage.expectActionCard("Review pending approvals");

    await copilotPage.close();
  });
});
