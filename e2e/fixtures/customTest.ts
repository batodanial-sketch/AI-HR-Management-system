import { test as base, expect } from "@playwright/test";
import { AuthPage } from "../page-objects/AuthPage";
import { DashboardPage } from "../page-objects/DashboardPage";
import { EmployeeDirectoryPage } from "../page-objects/EmployeeDirectoryPage";
import { EmployeeProfilePage } from "../page-objects/EmployeeProfilePage";
import { RecruitmentKanbanPage } from "../page-objects/RecruitmentKanbanPage";
import { LeavePage } from "../page-objects/LeavePage";
import { PayrollPage } from "../page-objects/PayrollPage";
import { CopilotPage } from "../page-objects/CopilotPage";
import { WorkflowBuilderPage } from "../page-objects/WorkflowBuilderPage";
import { AnalyticsPage } from "../page-objects/AnalyticsPage";

/**
 * Extends the Playwright base test with pre-instantiated page objects so specs
 * can declare typed fixtures directly:
 *
 *   test("example", async ({ dashboardPage }) => { ... });
 */
interface PageObjectFixtures {
  authPage: AuthPage;
  dashboardPage: DashboardPage;
  employeeDirectoryPage: EmployeeDirectoryPage;
  employeeProfilePage: EmployeeProfilePage;
  recruitmentKanbanPage: RecruitmentKanbanPage;
  leavePage: LeavePage;
  payrollPage: PayrollPage;
  copilotPage: CopilotPage;
  workflowBuilderPage: WorkflowBuilderPage;
  analyticsPage: AnalyticsPage;
}

export const test = base.extend<PageObjectFixtures>({
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  employeeDirectoryPage: async ({ page }, use) => {
    await use(new EmployeeDirectoryPage(page));
  },
  employeeProfilePage: async ({ page }, use) => {
    await use(new EmployeeProfilePage(page));
  },
  recruitmentKanbanPage: async ({ page }, use) => {
    await use(new RecruitmentKanbanPage(page));
  },
  leavePage: async ({ page }, use) => {
    await use(new LeavePage(page));
  },
  payrollPage: async ({ page }, use) => {
    await use(new PayrollPage(page));
  },
  copilotPage: async ({ page }, use) => {
    await use(new CopilotPage(page));
  },
  workflowBuilderPage: async ({ page }, use) => {
    await use(new WorkflowBuilderPage(page));
  },
  analyticsPage: async ({ page }, use) => {
    await use(new AnalyticsPage(page));
  },
});

export { expect };
