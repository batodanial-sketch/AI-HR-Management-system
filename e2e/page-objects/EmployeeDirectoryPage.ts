import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for the employee directory.
 *
 * Route:   /employees
 * Contract (data-testid):
 *   employee-directory-search — search input
 *   employee-directory-table  — table container
 *   employee-row              — a single employee row
 *   employee-add-button       — opens the add-employee flow
 *   employee-directory-empty  — empty state (shown when no rows match)
 */
export class EmployeeDirectoryPage extends BasePage {
  private readonly searchInput: Locator;
  private readonly table: Locator;
  private readonly addButton: Locator;
  private readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = this.getByTestId("employee-directory-search");
    this.table = this.getByTestId("employee-directory-table");
    this.addButton = this.getByTestId("employee-add-button");
    this.emptyState = this.getByTestId("employee-directory-empty");
  }

  override async goto(): Promise<void> {
    await super.goto("/employees");
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await this.waitForAppReady();
    await expect(this.searchInput).toBeVisible();
    await expect(this.table).toBeVisible();
  }

  private get employeeRows(): Locator {
    return this.table.locator('[data-testid="employee-row"]');
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.waitForNetworkIdle();
  }

  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
    await this.waitForNetworkIdle();
  }

  /** Number of employee rows currently rendered. */
  async getEmployeeCount(): Promise<number> {
    return this.employeeRows.count();
  }

  /** Asserts a specific employee (by full name) is visible in the directory. */
  async expectEmployeeVisible(fullName: string): Promise<void> {
    const row = this.employeeRows.filter({ hasText: fullName }).first();
    await expect(row).toBeVisible();
  }

  /** Asserts a specific employee is NOT present in the current result set. */
  async expectEmployeeAbsent(fullName: string): Promise<void> {
    const row = this.employeeRows.filter({ hasText: fullName });
    await expect(row).toHaveCount(0);
  }

  async expectEmptyState(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }

  /** Asserts exactly `count` rows are rendered. */
  async expectEmployeeCount(count: number): Promise<void> {
    await expect(this.employeeRows).toHaveCount(count);
  }

  async openAddEmployee(): Promise<void> {
    await this.addButton.click();
    await this.page.waitForURL(/\/employees\/new/);
  }
}
