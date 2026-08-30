import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Agentic Copilot — tool-calling loop, inline approval UX, and result cards.
 *
 * Hermetic: the AI bridge is never called. We intercept `/api/ai/copilot`
 * (the Next.js orchestrator) and replay a scripted SSE stream:
 *
 *   planner  → tool_call (confirmationRequired) → done (requiresConfirmation)
 *   approve  → tool_call (executing) → tool_result → delta → done
 *
 * This exercises the full client path — streaming parser, approval card,
 * Approve/Deny interactions, the confirmToolCall resend, and the inline
 * result cards with live status badges — with zero external dependencies.
 */

const COPILOT_PATH = "/copilot";
const COPILOT_ENDPOINT = "**/api/ai/copilot";

const approvalStream = (tool: string, args: Record<string, unknown>) => [
  {
    type: "tool_call",
    call: { name: tool, arguments: args, confirmationRequired: true, description: "Creates a pending expense claim." },
  },
  { type: "done", result: { text: "", actions: [], requiresConfirmation: true } },
];

const executionStream = (tool: string, data: Record<string, unknown>, finalText: string) => [
  { type: "tool_call", call: { name: tool, arguments: {}, confirmationRequired: false, status: "executing" } },
  { type: "tool_result", result: { tool, ok: true, message: "Tool completed.", data } },
  { type: "delta", content: finalText },
  { type: "done", result: { text: finalText, actions: [] } },
];

function sse(events: Array<Record<string, unknown>>): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

async function routeCopilot(page: Page, handler: (route: Route, body: unknown) => Promise<void>) {
  await page.route(COPILOT_ENDPOINT, async (route) => {
    const body = (await route.request().postDataJSON()) as Record<string, unknown>;
    await handler(route, body);
  });
}

async function askCopilot(page: Page, message: string) {
  await page.goto(COPILOT_PATH);
  await page.getByLabel("Copilot message").fill(message);
  await page.getByLabel("Send message").click();
}

test.describe("Agentic Copilot tool loop", () => {
  test("write tool renders an approval card; Approve executes it and shows the result card", async ({ page }) => {
    const requests: unknown[] = [];
    await routeCopilot(page, async (route, body) => {
      requests.push(body);
      if (body.confirmToolCall) {
        // The client resends with the confirmed tool call — execute it.
        const confirmed = body.confirmToolCall as { name: string };
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse(
            executionStream(
              confirmed.name,
              { id: "exp-e2e-1", status: "submitted", recommendation: null },
              "Expense submitted — awaiting finance review.",
            ),
          ),
        });
        return;
      }
      // Planner: wants to create an expense (write tool → confirmation).
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse(
          approvalStream("create_expense", {
            employeeId: "00000000-0000-4000-8000-000000000001",
            amount: 240,
            category: "Software",
            expenseDate: "2026-08-30",
            currencyCode: "USD",
            merchant: "AWS",
          }),
        ),
      });
    });

    await askCopilot(page, "Create an expense for AWS training");

    // Inline approval card with the write tool awaiting consent.
    const approvalCard = page.getByTestId("tool-step-card");
    await expect(approvalCard).toBeVisible();
    await expect(approvalCard).toContainText("Create expense");
    await expect(approvalCard).toContainText("Awaiting approval");

    await page.getByLabel("Approve Create expense").click();

    // Confirm the client resent the exact confirmed tool call.
    await expect
      .poll(() => requests.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    const confirmedRequest = requests[1] as {
      confirmToolCall: { name: string; arguments: Record<string, unknown> };
    };
    expect(confirmedRequest.confirmToolCall.name).toBe("create_expense");
    expect(confirmedRequest.confirmToolCall.arguments.amount).toBe(240);

    // The tool result card renders live status badges from the CRUD response.
    await expect(page.getByTestId("tool-result-card")).toBeVisible();
    await expect(page.getByTestId("tool-result-card")).toContainText("Status: submitted");
    await expect(page.getByText("Expense submitted — awaiting finance review.")).toBeVisible();
  });

  test("Deny closes the approval card without executing the tool", async ({ page }) => {
    let requestCount = 0;
    await routeCopilot(page, async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse(
          approvalStream("approve_offboarding", {
            id: "00000000-0000-4000-8000-000000000002",
          }),
        ),
      });
    });

    await askCopilot(page, "Approve offboarding for case 2");

    await expect(page.getByTestId("tool-step-card")).toContainText("Approve offboarding");
    await page.getByLabel("Deny Approve offboarding").click();

    // Denied state renders and no confirmToolCall request is ever sent.
    await expect(page.getByTestId("tool-step-card")).toContainText("Denied");
    await page.waitForTimeout(1_500);
    expect(requestCount).toBe(1);
  });

  test("read tools execute immediately and stream the final answer", async ({ page }) => {
    await routeCopilot(page, async (route, body) => {
      if (body.confirmToolCall) {
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse([{ type: "done", result: { text: "unexpected", actions: [] } }]),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse(
          executionStream(
            "fetch_expenses",
            [{ id: "exp-1", employeeName: "Priya Nair", status: "pending" }],
            "You have 3 pending expense claims.",
          ),
        ),
      });
    });

    await askCopilot(page, "Show pending expenses");

    // Read tools need no approval: result card + final answer appear directly.
    await expect(page.getByTestId("tool-step-card")).toContainText("Fetch expenses");
    await expect(page.getByTestId("tool-result-card")).toBeVisible();
    await expect(page.getByText("You have 3 pending expense claims.")).toBeVisible();
    await expect(page.getByLabel("Approve Fetch expenses")).toHaveCount(0);
  });
});
