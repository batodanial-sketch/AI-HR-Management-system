import { type SupabaseClient } from "@supabase/supabase-js";
import {
  E2E_MARKER,
  E2E_ORG_ID,
  E2E_EMP_ONE,
  E2E_EMP_TWO,
  E2E_EMP_THREE,
  E2E_EMP_CURRENT,
} from "./supabase-test-seed";

/**
 * Domain seeding + cleanup for the HR feature suites (leave, payroll) and the
 * Google Workspace provisioning model (see migrations 0002, 0005, 0006).
 * Every row carries source_tag = E2E_MARKER and is scoped to the E2E org so
 * teardown can remove it without touching production data.
 */

/* ------------------------------------------------------------------ */
/* Fixed UUIDs (domain-scoped)                                         */
/* ------------------------------------------------------------------ */

const LEAVE_001 = "00000000-0000-4000-8000-00000000e301";
const LEAVE_002 = "00000000-0000-4000-8000-00000000e302";
const BAL_PTO = "00000000-0000-4000-8000-00000000e401";
const BAL_SICK = "00000000-0000-4000-8000-00000000e402";
const BAL_ONE_PTO = "00000000-0000-4000-8000-00000000e403";
const RUN_001 = "00000000-0000-4000-8000-00000000e501";
const RUN_002 = "00000000-0000-4000-8000-00000000e502";
const LINE_001 = "00000000-0000-4000-8000-00000000e601";
const LINE_002 = "00000000-0000-4000-8000-00000000e602";
const LINE_003 = "00000000-0000-4000-8000-00000000e603";
const DOMAIN_FLUXENTIQ = "00000000-0000-4000-8000-00000000e701";
const DOMAIN_BLOCKED = "00000000-0000-4000-8000-00000000e702";
const DOMAIN_AMBIGUOUS = "00000000-0000-4000-8000-00000000e703";
const MEMBERSHIP_001 = "00000000-0000-4000-8000-00000000e704";
const INVITE_001 = "00000000-0000-4000-8000-00000000e705";
const ACCESS_001 = "00000000-0000-4000-8000-00000000e706";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type LeaveType = "pto" | "sick" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequestRow {
  id: string;
  organization_id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  source_tag: string;
}

export interface LeaveBalanceRow {
  id: string;
  employee_id: string;
  type: "pto" | "sick";
  balance_days: number;
  source_tag: string;
}

export type PayrollRunStatus = "draft" | "processing" | "completed";

export interface PayrollRunRow {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  status: PayrollRunStatus;
  currency: string;
  source_tag: string;
}

export interface PayrollLineItemRow {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  currency: string;
  source_tag: string;
}

export type ProvisioningStatus = "provisioned" | "not_provisioned" | "ambiguous";
export type MembershipPolicy = "allow_existing" | "require_invite" | "require_membership";

export interface WorkspaceDomainRow {
  id: string;
  organization_id: string;
  domain: string;
  provisioning_status: ProvisioningStatus;
  membership_policy: MembershipPolicy;
  allow_personal_accounts: boolean;
  source_tag: string;
}

export interface WorkspaceMembershipRow {
  id: string;
  organization_id: string;
  email: string;
  domain: string;
  role: "member" | "admin";
  source_tag: string;
}

export interface WorkspaceInviteRow {
  id: string;
  organization_id: string;
  email: string;
  domain: string;
  status: "pending" | "activated";
  source_tag: string;
}

export type AccessRequestStatus = "pending" | "approved" | "denied";

export interface AccessRequestRow {
  id: string;
  organization_id: string;
  email: string;
  domain: string;
  status: AccessRequestStatus;
  token: string | null;
  source_tag: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function assertOk(table: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`Failed to seed table "${table}": ${error.message}`);
  }
}

/**
 * Ensures an employee row exists whose email matches the authenticated E2E
 * user, so "current user" flows (leave requests, balances) resolve against a
 * real employee record. Returns the deterministic employee id.
 */
export async function seedCurrentEmployee(
  admin: SupabaseClient,
  email: string,
): Promise<string> {
  const { error } = await admin.from("employees").upsert(
    {
      id: E2E_EMP_CURRENT,
      organization_id: E2E_ORG_ID,
      first_name: "E2E",
      last_name: "CurrentUser",
      email,
      department: "People Ops",
      role: "HR Administrator",
      employment_status: "active",
      start_date: "2024-06-01",
      source_tag: E2E_MARKER,
    },
    { onConflict: "id" },
  );
  assertOk("employees", error);
  return E2E_EMP_CURRENT;
}

/* ------------------------------------------------------------------ */
/* Leave                                                               */
/* ------------------------------------------------------------------ */

export async function seedLeaveData(
  admin: SupabaseClient,
  currentUserEmail: string,
): Promise<void> {
  await seedCurrentEmployee(admin, currentUserEmail);

  const { error: balancesError } = await admin.from("leave_balances").upsert(
    [
      {
        id: BAL_PTO,
        employee_id: E2E_EMP_CURRENT,
        type: "pto",
        balance_days: 20,
        source_tag: E2E_MARKER,
      },
      {
        id: BAL_SICK,
        employee_id: E2E_EMP_CURRENT,
        type: "sick",
        balance_days: 10,
        source_tag: E2E_MARKER,
      },
      {
        id: BAL_ONE_PTO,
        employee_id: E2E_EMP_ONE,
        type: "pto",
        balance_days: 20,
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  assertOk("leave_balances", balancesError);

  const { error: requestsError } = await admin.from("leave_requests").upsert(
    [
      {
        id: LEAVE_001,
        organization_id: E2E_ORG_ID,
        employee_id: E2E_EMP_ONE,
        type: "pto",
        start_date: "2025-03-10",
        end_date: "2025-03-12",
        status: "pending",
        source_tag: E2E_MARKER,
      },
      {
        id: LEAVE_002,
        organization_id: E2E_ORG_ID,
        employee_id: E2E_EMP_TWO,
        type: "sick",
        start_date: "2025-03-01",
        end_date: "2025-03-02",
        status: "approved",
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  assertOk("leave_requests", requestsError);
}

export async function cleanupLeaveData(admin: SupabaseClient): Promise<void> {
  const { error: requestsError } = await admin
    .from("leave_requests")
    .delete()
    .eq("source_tag", E2E_MARKER);
  assertOk("leave_requests", requestsError);

  const { error: balancesError } = await admin
    .from("leave_balances")
    .delete()
    .eq("source_tag", E2E_MARKER);
  assertOk("leave_balances", balancesError);

  const { error: employeeError } = await admin
    .from("employees")
    .delete()
    .eq("id", E2E_EMP_CURRENT);
  assertOk("employees", employeeError);
}

/* ------------------------------------------------------------------ */
/* Payroll                                                             */
/* ------------------------------------------------------------------ */

export async function seedPayrollData(admin: SupabaseClient): Promise<void> {
  const { error: runsError } = await admin.from("payroll_runs").upsert(
    [
      {
        id: RUN_001,
        organization_id: E2E_ORG_ID,
        period_start: "2025-02-01",
        period_end: "2025-02-28",
        status: "draft",
        currency: "USD",
        source_tag: E2E_MARKER,
      },
      {
        id: RUN_002,
        organization_id: E2E_ORG_ID,
        period_start: "2025-02-01",
        period_end: "2025-02-28",
        status: "draft",
        currency: "EUR",
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  assertOk("payroll_runs", runsError);

  const { error: linesError } = await admin.from("payroll_line_items").upsert(
    [
      {
        id: LINE_001,
        payroll_run_id: RUN_001,
        employee_id: E2E_EMP_ONE,
        gross_pay: 5000,
        deductions: 1000,
        net_pay: 4000,
        currency: "USD",
        source_tag: E2E_MARKER,
      },
      {
        id: LINE_002,
        payroll_run_id: RUN_001,
        employee_id: E2E_EMP_TWO,
        gross_pay: 6000,
        deductions: 1200,
        net_pay: 4800,
        currency: "USD",
        source_tag: E2E_MARKER,
      },
      {
        id: LINE_003,
        payroll_run_id: RUN_002,
        employee_id: E2E_EMP_THREE,
        gross_pay: 4000,
        deductions: 800,
        net_pay: 3200,
        currency: "EUR",
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  assertOk("payroll_line_items", linesError);
}

export async function cleanupPayrollData(admin: SupabaseClient): Promise<void> {
  const { error: linesError } = await admin
    .from("payroll_line_items")
    .delete()
    .eq("source_tag", E2E_MARKER);
  assertOk("payroll_line_items", linesError);

  const { error: runsError } = await admin
    .from("payroll_runs")
    .delete()
    .eq("source_tag", E2E_MARKER);
  assertOk("payroll_runs", runsError);
}

/* ------------------------------------------------------------------ */
/* Google Workspace provisioning + access requests                     */
/* ------------------------------------------------------------------ */

export async function seedWorkspaceData(admin: SupabaseClient): Promise<void> {
  const { error: domainsError } = await admin.from("workspace_domains").upsert(
    [
      {
        id: DOMAIN_FLUXENTIQ,
        organization_id: E2E_ORG_ID,
        domain: "fluxentiq.test",
        provisioning_status: "provisioned",
        membership_policy: "require_membership",
        allow_personal_accounts: false,
        source_tag: E2E_MARKER,
      },
      {
        id: DOMAIN_BLOCKED,
        organization_id: E2E_ORG_ID,
        domain: "blocked.test",
        provisioning_status: "not_provisioned",
        membership_policy: "require_membership",
        allow_personal_accounts: false,
        source_tag: E2E_MARKER,
      },
      {
        id: DOMAIN_AMBIGUOUS,
        organization_id: E2E_ORG_ID,
        domain: "ambiguous.test",
        provisioning_status: "ambiguous",
        membership_policy: "require_membership",
        allow_personal_accounts: false,
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  assertOk("workspace_domains", domainsError);

  const { error: membershipsError } = await admin
    .from("workspace_memberships")
    .upsert(
      [
        {
          id: MEMBERSHIP_001,
          organization_id: E2E_ORG_ID,
          email: "member@fluxentiq.test",
          domain: "fluxentiq.test",
          role: "member",
          source_tag: E2E_MARKER,
        },
      ],
      { onConflict: "id" },
    );
  assertOk("workspace_memberships", membershipsError);

  const { error: invitesError } = await admin.from("workspace_invites").upsert(
    [
      {
        id: INVITE_001,
        organization_id: E2E_ORG_ID,
        email: "invited@fluxentiq.test",
        domain: "fluxentiq.test",
        status: "pending",
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  assertOk("workspace_invites", invitesError);

  const { error: accessError } = await admin.from("access_requests").upsert(
    [
      {
        id: ACCESS_001,
        organization_id: E2E_ORG_ID,
        email: "approved@fluxentiq.test",
        domain: "fluxentiq.test",
        status: "approved",
        token: "e2e-signed-token-123",
        source_tag: E2E_MARKER,
      },
    ],
    { onConflict: "id" },
  );
  assertOk("access_requests", accessError);
}

export async function cleanupWorkspaceData(admin: SupabaseClient): Promise<void> {
  const { error: accessError } = await admin
    .from("access_requests")
    .delete()
    .eq("source_tag", E2E_MARKER);
  assertOk("access_requests", accessError);

  const { error: invitesError } = await admin
    .from("workspace_invites")
    .delete()
    .eq("source_tag", E2E_MARKER);
  assertOk("workspace_invites", invitesError);

  const { error: membershipsError } = await admin
    .from("workspace_memberships")
    .delete()
    .eq("source_tag", E2E_MARKER);
  assertOk("workspace_memberships", membershipsError);

  const { error: domainsError } = await admin
    .from("workspace_domains")
    .delete()
    .eq("source_tag", E2E_MARKER);
  assertOk("workspace_domains", domainsError);
}
