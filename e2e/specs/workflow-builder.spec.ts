import { test } from "../fixtures/customTest";

/**
 * Visual workflow builder suite: canvas drag/drop, trigger configuration and
 * save confirmation.
 */
test.describe("Workflow builder", () => {
  test("assembles and saves a workflow via drag and drop", async ({
    workflowBuilderPage,
  }) => {
    await workflowBuilderPage.goto();

    await workflowBuilderPage.dragNodeToCanvas("trigger");
    await workflowBuilderPage.expectNodeOnCanvas("trigger");

    await workflowBuilderPage.dragNodeToCanvas("action");
    await workflowBuilderPage.expectNodeOnCanvas("action");

    await workflowBuilderPage.configureTrigger("employee.created");
    await workflowBuilderPage.expectTriggerEvent("employee.created");

    await workflowBuilderPage.save();
    await workflowBuilderPage.expectSaved();
  });
});
