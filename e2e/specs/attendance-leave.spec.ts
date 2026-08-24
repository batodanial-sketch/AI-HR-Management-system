import { expect, test } from "../fixtures/customTest";
import { createAdminClient, E2E_EMP_ONE } from "../utils/supabase-test-seed";
import { cleanupLeaveData, seedLeaveData } from "../utils/domain-seed";

/**
 * Attendance & leave suite: PTO submission, manager approval queue, and leave
 * balance reconciliation. Seeds leave data keyed to the authenticated E2E user
 * and to the baseline employees.
 */
test.describe("Attendance & leave", () => {
  test.beforeAll(async () => {
    const email = process.env.E2E_TEST_USER_EMAIL;
    if (!email) {
      throw new Error("E2E_TEST_USER_EMAIL is required for the leave suite.");
    }
    await seedLeaveData(createAdminClient(), email);
  });

  test.afterAll(async () => {
    await cleanupLeaveData(createAdminClient());
  });

  test("submits a PTO request and shows it as pending", async ({ leavePage }) => {
    await leavePage.goto();
    await leavePage.submitRequest({
      type: "pto",
      startDate: "2025-04-01",
      endDate: "2025-04-02",
      reason: "E2E vacation",
    });
    await leavePage.expectMyRequestStatus("pending");
  });

  test("shows seeded leave balances for the current user", async ({ leavePage }) => {
    await leavePage.goto();
    expect(await leavePage.getBalance("pto")).toBe(20);
    expect(await leavePage.getBalance("sick")).toBe(10);
  });

  test("manager approval queue approves a request and updates the balance", async ({
    leavePage,
  }) => {
    await leavePage.goto();
    await leavePage.gotoApprovalQueue();

    await leavePage.approveRequest("E2E EmployeeOne");
    await leavePage.expectQueueRequestStatus("E2E EmployeeOne", "approved");

    // e2e-leave-001 is a 3-day PTO against a 20-day balance → 17 remaining.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("leave_balances")
      .select("balance_days")
      .eq("employee_id", E2E_EMP_ONE)
      .eq("type", "pto")
      .single();
    if (error) {
      throw new Error(`Balance query failed: ${error.message}`);
    }
    expect(data?.balance_days).toBe(17);
  });
});
