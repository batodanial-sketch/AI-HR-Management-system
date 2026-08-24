import "server-only";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getMemoryAdapter } from "@/lib/memory/factory";
import { readSettings } from "@/lib/settings/config";
import type { Row } from "@/lib/memory/types";
import * as seed from "./data";
import type {
  Candidate,
  DashboardMetric,
  Deal,
  Employee,
  Lead,
  LeaveBalance,
  LeaveRequest,
  Organization,
  OrgMember,
  OrgRole,
  PayrollLineItem,
  PayrollRun,
} from "./types";

/**
 * Server-side data access for the Fluxentiq platform.
 *
 * Reads are routed through the active Memory adapter, so the app displays
 * whichever backend the buyer selected in Settings (Supabase by default, or
 * PostgreSQL / Xata / SQLite / custom / local). When the default Supabase
 * memory is unconfigured — e.g. the in-app preview — the deterministic seed
 * records keep the UI populated.
 *
 * Identity/team reads (organizations, profiles, memberships) remain on
 * Supabase, since they are tied to auth.users.
 */

/** Seed fallback applies only when default Supabase memory is unconfigured. */
async function shouldUseSeed(): Promise<boolean> {
  const settings = await readSettings();
  if (settings.memory.provider !== "supabase") {
    return false;
  }
  return !hasSupabaseEnv();
}

/** Returns the org filter only for Supabase (multi-tenant scoping). */
async function orgFilter(memory: { provider: string }) {
  if (memory.provider !== "supabase") {
    return undefined;
  }
  const orgId = (await getCurrentUser()).organizationId;
  return orgId ? { column: "organization_id", value: orgId } : undefined;
}

/* -- safe value coercion helpers (adapters return Record<string, unknown>) -- */

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function array(value: unknown): number[] {
  return Array.isArray(value) ? value.map((item) => num(item)) : [];
}

/* -- domain reads ----------------------------------------------------------- */

export async function getEmployees(): Promise<Employee[]> {
  if (await shouldUseSeed()) {
    return seed.employees;
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("employees", await orgFilter(memory));
  return rows.map((row) => ({
    id: text(row.id),
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    email: text(row.email),
    department: text(row.department, "—"),
    role: text(row.role, text(row.title, "—")),
    title: text(row.title, text(row.role, "—")),
    employmentStatus: text(row.employment_status, "active") as Employee["employmentStatus"],
    startDate: text(row.start_date),
    location: text(row.location, "Remote"),
    managerId: typeof row.manager_id === "string" ? row.manager_id : null,
  }));
}

export async function getCandidates(): Promise<Candidate[]> {
  if (await shouldUseSeed()) {
    return seed.candidates;
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("candidates", await orgFilter(memory));
  return rows.map((row) => ({
    id: text(row.id),
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    email: text(row.email),
    role: text(row.role, "—"),
    jobPostingId: text(row.job_posting_id),
    stage: text(row.stage, "applied") as Candidate["stage"],
    matchScore: num(row.match_score),
    source: text(row.source, "Direct"),
    resumeUrl: typeof row.resume_url === "string" ? row.resume_url : null,
  }));
}

export async function getDashboardMetrics(): Promise<DashboardMetric[]> {
  if (await shouldUseSeed()) {
    return seed.dashboardMetrics;
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("dashboard_metrics", await orgFilter(memory));
  if (rows.length === 0) {
    return seed.dashboardMetrics;
  }
  return rows.map((row) => ({
    key: text(row.key) as DashboardMetric["key"],
    label: text(row.label),
    value: num(row.value),
    delta: num(row.delta),
    deltaLabel: text(row.delta_label, "vs last month"),
    spark: array(row.spark),
    format: (text(row.format, "number") as DashboardMetric["format"]),
    currency: typeof row.currency === "string" ? row.currency : undefined,
  }));
}

export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  if (await shouldUseSeed()) {
    return seed.leaveRequests;
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("leave_requests", await orgFilter(memory));
  return rows.map((row) => ({
    id: text(row.id),
    employeeId: text(row.employee_id),
    employeeName: text(row.employee_name, "Unknown"),
    type: text(row.type, "pto") as LeaveRequest["type"],
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    reason: text(row.reason),
    status: text(row.status, "pending") as LeaveRequest["status"],
  }));
}

export async function getLeaveBalances(): Promise<LeaveBalance[]> {
  if (await shouldUseSeed()) {
    return seed.leaveBalances;
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("leave_balances");
  return rows
    .filter((row) => row.type === "pto" || row.type === "sick")
    .map((row) => ({
      employeeId: text(row.employee_id),
      type: row.type as "pto" | "sick",
      balanceDays: num(row.balance_days),
      usedDays: num(row.used_days),
    }));
}

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  if (await shouldUseSeed()) {
    return seed.payrollRuns;
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("payroll_runs", await orgFilter(memory));
  return rows.map((row) => ({
    id: text(row.id),
    periodStart: text(row.period_start),
    periodEnd: text(row.period_end),
    status: text(row.status, "draft") as PayrollRun["status"],
    currency: text(row.currency, "USD"),
  }));
}

export async function getPayrollLineItems(
  runId: string,
): Promise<PayrollLineItem[]> {
  if (await shouldUseSeed()) {
    return seed.payrollLineItems.filter((item) => item.payrollRunId === runId);
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("payroll_line_items", {
    column: "payroll_run_id",
    value: runId,
  });
  return rows.map((row) => ({
    id: text(row.id),
    payrollRunId: text(row.payroll_run_id),
    employeeId: text(row.employee_id),
    employeeName: text(row.employee_name, "Unknown"),
    grossPay: num(row.gross_pay),
    deductions: num(row.deductions),
    netPay: num(row.net_pay),
    currency: text(row.currency, "USD"),
  }));
}

export async function getLeads(): Promise<Lead[]> {
  if (await shouldUseSeed()) {
    return seed.leads;
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("leads", await orgFilter(memory));
  return rows.map((row) => ({
    id: text(row.id),
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    email: text(row.email),
    company: text(row.company),
    title: text(row.title),
    source: text(row.source, "Direct"),
    status: text(row.status, "new") as Lead["status"],
    score: num(row.score),
  }));
}

export async function getDeals(): Promise<Deal[]> {
  if (await shouldUseSeed()) {
    return seed.deals;
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("deals", await orgFilter(memory));
  return rows.map((row) => ({
    id: text(row.id),
    leadId: typeof row.lead_id === "string" ? row.lead_id : null,
    name: text(row.name),
    value: num(row.value),
    currency: text(row.currency, "USD"),
    stage: text(row.stage, "discovery") as Deal["stage"],
    probability: num(row.probability),
    expectedCloseDate: typeof row.expected_close_date === "string" ? row.expected_close_date : null,
  }));
}

/* -- identity reads (Supabase-backed) --------------------------------------- */

export async function getOrganization(): Promise<Organization | null> {
  const orgId = (await getCurrentUser()).organizationId;
  if (!orgId) {
    return null;
  }
  if (!hasSupabaseEnv()) {
    return {
      id: orgId,
      name: "Fluxentiq HQ",
      slug: "fluxentiq-hq",
      plan: "enterprise",
      billingStatus: "trialing",
      createdAt: "",
    };
  }
  const { data, error } = await serverClient()
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    // Live organizations.plan is free-text (legacy); coerce to the canonical
    // union with a safe fallback.
    plan: (data.plan as Organization["plan"]) ?? "free",
    billingStatus: data.billing_status,
    createdAt: data.created_at,
  };
}

export async function getMembers(): Promise<OrgMember[]> {
  const orgId = (await getCurrentUser()).organizationId;
  if (!orgId) {
    return [];
  }
  if (!hasSupabaseEnv()) {
    return [
      {
        id: "m-demo",
        userId: "demo-user",
        fullName: "Ayesha Rahman",
        email: "ayesha.rahman@fluxentiq.test",
        role: "admin",
      },
    ];
  }

  const { data, error } = await serverClient()
    .from("memberships")
    .select("id, user_id, role")
    .eq("organization_id", orgId);
  if (error || !data) {
    return [];
  }

  const userIds = data.map((membership) => membership.user_id);
  const { data: profiles } = await serverClient()
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );

  return data.map((membership) => {
    const profile = profileMap.get(membership.user_id);
    return {
      id: membership.id,
      userId: membership.user_id,
      fullName: profile?.full_name ?? "Unknown",
      email: profile?.email ?? "",
      // Live memberships.role is free-text; coerce to the OrgRole union.
      role: (membership.role as OrgRole) ?? "member",
    };
  });
}
