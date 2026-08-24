import { test } from "../fixtures/customTest";
import { createAdminClient } from "../utils/supabase-test-seed";
import { cleanupPayrollData, seedPayrollData } from "../utils/domain-seed";

/**
 * Payroll suite: global run execution, row calculation assertions and
 * multi-currency verification against seeded draft runs and line items.
 */
test.describe("Payroll", () => {
  test.beforeAll(async () => {
    await seedPayrollData(createAdminClient());
  });

  test.afterAll(async () => {
    await cleanupPayrollData(createAdminClient());
  });

  test("executes the global run and verifies row calculations", async ({
    payrollPage,
  }) => {
    await payrollPage.goto();

    await payrollPage.executeRun();
    await payrollPage.expectRunStatus("e2e-run-001", "completed");

    // net = gross - deductions for every USD line.
    await payrollPage.expectLineBalances("e2e-emp-001");
    await payrollPage.expectLineBalances("e2e-emp-002");

    await payrollPage.expectLineNet("e2e-emp-001", 4000);
    await payrollPage.expectLineNet("e2e-emp-002", 4800);
  });

  test("verifies multi-currency run isolation", async ({ payrollPage }) => {
    await payrollPage.goto();

    await payrollPage.selectCurrency("EUR");
    await payrollPage.expectCurrencyIndicator("EUR");
    await payrollPage.expectLineNet("e2e-emp-003", 3200);

    await payrollPage.selectCurrency("USD");
    await payrollPage.expectCurrencyIndicator("USD");
  });
});
