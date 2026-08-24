import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for payroll.
 *
 * Route:   /payroll
 *
 * Contract (data-testid):
 *   payroll-run-button        — executes the global payroll run
 *   payroll-currency-select   — currency filter (data-currency)
 *   payroll-currency-indicator — active currency (data-currency)
 *   payroll-run-row           — a run row (data-run-id)
 *   payroll-run-status        — run status (data-status)
 *   payroll-line-row          — a payslip line (data-employee-id)
 *   payroll-line-gross / -deductions / -net — amounts (data-value)
 */
export class PayrollPage extends BasePage {
  private readonly runButton: Locator;
  private readonly currencySelect: Locator;
  private readonly currencyIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.runButton = this.getByTestId("payroll-run-button");
    this.currencySelect = this.getByTestId("payroll-currency-select");
    this.currencyIndicator = this.getByTestId("payroll-currency-indicator");
  }

  override async goto(): Promise<void> {
    await super.goto("/payroll");
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await this.waitForAppReady();
    await expect(this.runButton).toBeVisible();
  }

  private runRow(runId: string): Locator {
    return this.getByTestId("payroll-run-row").filter({
      has: this.page.locator(`[data-run-id="${runId}"]`),
    }).first();
  }

  async executeRun(): Promise<void> {
    await this.runButton.click();
    await this.waitForNetworkIdle();
  }

  async expectRunStatus(
    runId: string,
    status: "draft" | "processing" | "completed",
  ): Promise<void> {
    const row = this.runRow(runId);
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid="payroll-run-status"]')).toHaveAttribute(
      "data-status",
      status,
    );
  }

  private lineRow(employeeId: string): Locator {
    return this.getByTestId("payroll-line-row").filter({
      has: this.page.locator(`[data-employee-id="${employeeId}"]`),
    }).first();
  }

  private async lineValue(employeeId: string, field: string): Promise<number> {
    const row = this.lineRow(employeeId);
    await expect(row).toBeVisible();
    const raw = (await row.locator(`[data-testid="${field}"]`).getAttribute("data-value")) ?? "";
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error(`Payroll line "${field}" for ${employeeId} has no numeric data-value (got "${raw}").`);
    }
    return parsed;
  }

  async getLineGross(employeeId: string): Promise<number> {
    return this.lineValue(employeeId, "payroll-line-gross");
  }

  async getLineDeductions(employeeId: string): Promise<number> {
    return this.lineValue(employeeId, "payroll-line-deductions");
  }

  async getLineNet(employeeId: string): Promise<number> {
    return this.lineValue(employeeId, "payroll-line-net");
  }

  /** Asserts a payslip line's net amount equals the expected value. */
  async expectLineNet(employeeId: string, expected: number): Promise<void> {
    const net = await this.getLineNet(employeeId);
    expect(net).toBe(expected);
  }

  /** Asserts net = gross - deductions for a given payslip line. */
  async expectLineBalances(employeeId: string): Promise<void> {
    const gross = await this.getLineGross(employeeId);
    const deductions = await this.getLineDeductions(employeeId);
    const net = await this.getLineNet(employeeId);
    expect(net).toBe(gross - deductions);
  }

  async selectCurrency(currency: string): Promise<void> {
    await this.currencySelect.selectOption(currency);
    await this.waitForNetworkIdle();
  }

  async expectCurrencyIndicator(currency: string): Promise<void> {
    await expect(this.currencyIndicator).toHaveAttribute("data-currency", currency);
  }
}
