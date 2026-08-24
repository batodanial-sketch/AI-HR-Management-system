import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./BasePage";

/**
 * Page object for attendance & leave.
 *
 * Route:   /leave
 *
 * Contract (data-testid):
 *   leave-type-select         — leave type dropdown (data-type)
 *   leave-start-date          — start date input
 *   leave-end-date            — end date input
 *   leave-reason-input        — optional reason textarea
 *   leave-submit-button       — submit request control
 *   leave-balance-{type}      — balance card (data-value); type ∈ {pto, sick}
 *   leave-my-requests         — current user's request list
 *   leave-request-row         — a single request (data-employee-id, data-status)
 *   leave-approval-queue      — manager approval queue
 *   leave-approve-button      — per-row approve control
 *   leave-reject-button       — per-row reject control
 */
export interface LeaveRequestInput {
  type: "pto" | "sick" | "unpaid";
  startDate: string;
  endDate: string;
  reason: string;
}

export class LeavePage extends BasePage {
  private readonly typeSelect: Locator;
  private readonly startDateInput: Locator;
  private readonly endDateInput: Locator;
  private readonly reasonInput: Locator;
  private readonly submitButton: Locator;
  private readonly myRequests: Locator;
  private readonly approvalQueue: Locator;

  constructor(page: Page) {
    super(page);
    this.typeSelect = this.getByTestId("leave-type-select");
    this.startDateInput = this.getByTestId("leave-start-date");
    this.endDateInput = this.getByTestId("leave-end-date");
    this.reasonInput = this.getByTestId("leave-reason-input");
    this.submitButton = this.getByTestId("leave-submit-button");
    this.myRequests = this.getByTestId("leave-my-requests");
    this.approvalQueue = this.getByTestId("leave-approval-queue");
  }

  override async goto(): Promise<void> {
    await super.goto("/leave");
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await this.waitForAppReady();
    await expect(this.typeSelect).toBeVisible();
    await expect(this.myRequests).toBeVisible();
  }

  /** Reads the current user's leave balance (days) for a given type. */
  async getBalance(type: "pto" | "sick"): Promise<number> {
    const balance = this.getByTestId(`leave-balance-${type}`);
    await expect(balance).toBeVisible();
    const raw = (await balance.getAttribute("data-value")) ?? "";
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error(`Leave balance "${type}" has no numeric data-value (got "${raw}").`);
    }
    return parsed;
  }

  async submitRequest(input: LeaveRequestInput): Promise<void> {
    await this.typeSelect.selectOption(input.type);
    await this.startDateInput.fill(input.startDate);
    await this.endDateInput.fill(input.endDate);
    await this.reasonInput.fill(input.reason);
    await this.submitButton.click();
    await this.waitForNetworkIdle();
  }

  /** Asserts the current user's own request appears with the given status. */
  async expectMyRequestStatus(status: "pending" | "approved" | "rejected"): Promise<void> {
    const row = this.myRequests
      .locator('[data-testid="leave-request-row"]')
      .filter({ has: this.page.locator(`[data-status="${status}"]`) })
      .first();
    await expect(row).toBeVisible();
  }

  async gotoApprovalQueue(): Promise<void> {
    await expect(this.approvalQueue).toBeVisible();
  }

  private queueRow(employeeName: string): Locator {
    return this.approvalQueue
      .locator('[data-testid="leave-request-row"]')
      .filter({ hasText: employeeName })
      .first();
  }

  async approveRequest(employeeName: string): Promise<void> {
    const row = this.queueRow(employeeName);
    await expect(row).toBeVisible();
    await row.locator('[data-testid="leave-approve-button"]').click();
    await this.waitForNetworkIdle();
  }

  async rejectRequest(employeeName: string): Promise<void> {
    const row = this.queueRow(employeeName);
    await expect(row).toBeVisible();
    await row.locator('[data-testid="leave-reject-button"]').click();
    await this.waitForNetworkIdle();
  }

  /** Asserts a queue row now reflects the given status. */
  async expectQueueRequestStatus(
    employeeName: string,
    status: "approved" | "rejected",
  ): Promise<void> {
    const row = this.queueRow(employeeName);
    await expect(row).toHaveAttribute("data-status", status);
  }
}
