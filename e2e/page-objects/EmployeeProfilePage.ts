import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for the employee create/edit form and profile view.
 *
 * Routes:  /employees/new       (create)
 *          /employees/[id]      (profile)
 *
 * Contract (data-testid):
 *   employee-form-first-name / -last-name / -email / -department / -role / -start-date
 *   employee-form-submit     — create/save control
 *   employee-profile         — profile card
 *   employee-profile-status  — employment status badge (data-status)
 *   employee-profile-name    — rendered full name
 *   employee-offboard-button / employee-offboard-confirm
 */
export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  role: string;
  startDate: string;
}

export class EmployeeProfilePage extends BasePage {
  private readonly firstNameInput: Locator;
  private readonly lastNameInput: Locator;
  private readonly emailInput: Locator;
  private readonly departmentInput: Locator;
  private readonly roleInput: Locator;
  private readonly startDateInput: Locator;
  private readonly submitButton: Locator;
  private readonly profileCard: Locator;
  private readonly statusBadge: Locator;
  private readonly profileName: Locator;
  private readonly offboardButton: Locator;
  private readonly offboardConfirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.firstNameInput = this.getByTestId("employee-form-first-name");
    this.lastNameInput = this.getByTestId("employee-form-last-name");
    this.emailInput = this.getByTestId("employee-form-email");
    this.departmentInput = this.getByTestId("employee-form-department");
    this.roleInput = this.getByTestId("employee-form-role");
    this.startDateInput = this.getByTestId("employee-form-start-date");
    this.submitButton = this.getByTestId("employee-form-submit");
    this.profileCard = this.getByTestId("employee-profile");
    this.statusBadge = this.getByTestId("employee-profile-status");
    this.profileName = this.getByTestId("employee-profile-name");
    this.offboardButton = this.getByTestId("employee-offboard-button");
    this.offboardConfirmButton = this.getByTestId("employee-offboard-confirm");
  }

  async gotoNew(): Promise<void> {
    await this.page.goto("/employees/new");
    await this.expectFormLoaded();
  }

  async gotoProfile(employeeId: string): Promise<void> {
    await this.page.goto(`/employees/${employeeId}`);
    await expect(this.profileCard).toBeVisible();
  }

  async expectFormLoaded(): Promise<void> {
    await this.waitForAppReady();
    await expect(this.firstNameInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async fillNewEmployee(input: NewEmployeeInput): Promise<void> {
    await this.firstNameInput.fill(input.firstName);
    await this.lastNameInput.fill(input.lastName);
    await this.emailInput.fill(input.email);
    await this.departmentInput.fill(input.department);
    await this.roleInput.fill(input.role);
    await this.startDateInput.fill(input.startDate);
  }

  async submitNewEmployee(): Promise<void> {
    await this.submitButton.click();
    await this.page.waitForURL(/\/employees\/[^/]+/);
  }

  async setFirstName(firstName: string): Promise<void> {
    await this.firstNameInput.fill(firstName);
  }

  async saveProfile(): Promise<void> {
    await this.submitButton.click();
    await this.waitForNetworkIdle();
  }

  async expectFirstName(firstName: string): Promise<void> {
    await expect(this.profileName).toHaveText(new RegExp(firstName));
  }

  /** Asserts the rendered employment status badge. */
  async expectStatus(status: "active" | "on_leave" | "terminated"): Promise<void> {
    await expect(this.statusBadge).toHaveAttribute("data-status", status);
  }

  async offboard(): Promise<void> {
    await this.offboardButton.click();
    await this.offboardConfirmButton.click();
    await this.waitForNetworkIdle();
  }
}
