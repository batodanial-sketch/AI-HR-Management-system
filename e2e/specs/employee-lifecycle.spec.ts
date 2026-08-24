import { expect, test } from "../fixtures/customTest";
import { createAdminClient, E2E_EMP_TWO } from "../utils/supabase-test-seed";

/**
 * Employee lifecycle suite: directory filtering, onboarding, profile edits and
 * offboarding. Relies on the baseline employees seeded by global-setup
 * (e2e-emp-001..003).
 */
test.describe("Employee directory", () => {
  test("filters the directory by search", async ({ employeeDirectoryPage }) => {
    await employeeDirectoryPage.goto();
    await employeeDirectoryPage.search("EmployeeOne");
    await employeeDirectoryPage.expectEmployeeVisible("E2E EmployeeOne");
    await employeeDirectoryPage.expectEmployeeAbsent("E2E EmployeeTwo");
    await employeeDirectoryPage.clearSearch();
    await employeeDirectoryPage.expectEmployeeCount(3);
  });
});

test.describe("Employee lifecycle", () => {
  test("adds a new employee", async ({
    employeeDirectoryPage,
    employeeProfilePage,
  }) => {
    const email = `e2e.new.${Date.now()}@fluxentiq.test`;
    try {
      await employeeDirectoryPage.goto();
      await employeeDirectoryPage.openAddEmployee();

      await employeeProfilePage.fillNewEmployee({
        firstName: "E2E",
        lastName: "NewHire",
        email,
        department: "Engineering",
        role: "Frontend Engineer",
        startDate: "2025-01-06",
      });
      await employeeProfilePage.submitNewEmployee();
      await employeeProfilePage.expectStatus("active");
      await employeeProfilePage.expectFirstName("E2E NewHire");
    } finally {
      const admin = createAdminClient();
      const { error } = await admin.from("employees").delete().eq("email", email);
      if (error) {
        throw new Error(`Cleanup of ${email} failed: ${error.message}`);
      }
    }
  });

  test("updates a profile and offboards an employee", async ({
    employeeProfilePage,
  }) => {
    const admin = createAdminClient();
    try {
      await employeeProfilePage.gotoProfile(E2E_EMP_TWO);

      await employeeProfilePage.setFirstName("E2E Updated");
      await employeeProfilePage.saveProfile();
      await employeeProfilePage.expectFirstName("E2E Updated");

      await employeeProfilePage.offboard();
      await employeeProfilePage.expectStatus("terminated");

      const { data } = await admin
        .from("employees")
        .select("employment_status")
        .eq("id", E2E_EMP_TWO)
        .single();
      expect(data?.employment_status).toBe("terminated");
    } finally {
      const { error } = await admin
        .from("employees")
        .update({ first_name: "E2E", employment_status: "active" })
        .eq("id", E2E_EMP_TWO);
      if (error) {
        throw new Error(`Restore of ${E2E_EMP_TWO} failed: ${error.message}`);
      }
    }
  });
});
