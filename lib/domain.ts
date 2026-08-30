import "server-only";
import { getMemoryAdapter } from "@/lib/memory/factory";
import { readSettings } from "@/lib/settings/config";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuditEntriesTyped } from "@/lib/legacy/adapters";
import type { MemoryAdapter } from "@/lib/memory/interface";
import type { Row, RowFilter } from "@/lib/memory/types";

/**
 * Domain data layer for the extended HR modules merged from the Fluxentiq
 * enterprise codebase (performance, attendance, learning, benefits, equity,
 * expenses, surveys, planning, contractors, offboarding, workforce, assets,
 * documents, compensation, audit, screening).
 *
 * Reads route through the pluggable Memory adapter (Supabase by default, or
 * PostgreSQL/Xata/SQLite/custom/local) and fall back to deterministic seed
 * records when Supabase is unconfigured — the same contract as `lib/api.ts`.
 */

/* ------------------------------------------------------------------ */
/* Types (self-contained; mirrors types/*.ts)                          */
/* ------------------------------------------------------------------ */

export type GoalStatus = "not_started" | "in_progress" | "at_risk" | "completed";
export interface OKRGoal {
  id: string;
  employeeName: string;
  title: string;
  objective: string;
  status: GoalStatus;
  progress: number;
  dueDate: string;
}

export interface PerformanceCycle {
  id: string;
  name: string;
  status: "draft" | "active" | "calibration" | "closed";
  startDate: string;
  endDate: string;
  participants: number;
}

export interface AttendanceRecord {
  id: string;
  employeeName: string;
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  status: "present" | "late" | "absent" | "remote" | "on_leave";
}

export interface LearningCourse {
  id: string;
  title: string;
  category: string;
  level: "foundation" | "intermediate" | "advanced";
  estimatedMinutes: number;
  enrolled: number;
  completionRate: number;
}

export interface BenefitPlan {
  id: string;
  name: string;
  provider: string;
  planType: string;
  employeeCost: number;
  employerCost: number;
  status: "active" | "closed" | "draft";
}

export interface EquityGrant {
  id: string;
  employeeName: string;
  grantType: "option" | "rsu" | "share" | "phantom";
  quantity: number;
  strikePrice: number | null;
  vestingMonths: number;
  status: "active" | "exercised" | "cancelled";
}

export interface Expense {
  id: string;
  employeeName: string;
  merchant: string;
  category: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
}

export interface PulseSurvey {
  id: string;
  title: string;
  anonymous: boolean;
  status: "draft" | "active" | "closed";
  responses: number;
  eNPS: number | null;
}

export interface WorkforceScenario {
  id: string;
  name: string;
  headcountForecast: number;
  budgetForecast: number;
  status: "draft" | "approved";
}

export interface ContractorInvoice {
  id: string;
  contractor: string;
  invoiceNumber: string;
  totalAmount: number;
  currency: string;
  status: "draft" | "submitted" | "approved" | "paid";
}

export interface OffboardingCase {
  id: string;
  employeeName: string;
  exitDate: string;
  status: "planned" | "in_progress" | "completed";
  tasksDone: number;
  tasksTotal: number;
}

export interface OrgNode {
  id: string;
  name: string;
  title: string;
  managerId: string | null;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  status: "available" | "assigned" | "maintenance" | "retired";
  assignee: string | null;
}

export interface DocumentRecord {
  id: string;
  name: string;
  kind: string;
  owner: string;
  sizeKb: number;
  uploadedAt: string;
}

export interface SalaryBand {
  id: string;
  level: string;
  title: string;
  min: number;
  mid: number;
  max: number;
  currency: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export interface ScreeningRecord {
  id: string;
  candidateName: string;
  role: string;
  score: number;
  recommendation: "advance" | "hold" | "reject";
  reviewedAt: string;
}

/* ------------------------------------------------------------------ */
/* Seed data (deterministic, mirrors supabase/seed patterns)           */
/* ------------------------------------------------------------------ */

const okrGoals: OKRGoal[] = [
  { id: "okr-1", employeeName: "Ayesha Rahman", title: "Platform migration", objective: "Migrate auth service to OIDC", status: "in_progress", progress: 65, dueDate: "2025-06-30" },
  { id: "okr-2", employeeName: "Miguel Torres", title: "Design system", objective: "Ship v2 component library", status: "on_track" as GoalStatus, progress: 90, dueDate: "2025-05-15" },
  { id: "okr-3", employeeName: "Priya Nair", title: "Payroll automation", objective: "Cut run time by 40%", status: "at_risk", progress: 30, dueDate: "2025-07-01" },
  { id: "okr-4", employeeName: "Daniel Mbeki", title: "Accessibility", objective: "WCAG 2.1 AA across app", status: "completed", progress: 100, dueDate: "2025-04-01" },
];

const performanceCycles: PerformanceCycle[] = [
  { id: "cyc-1", name: "Q2 2025 Review Cycle", status: "active", startDate: "2025-04-01", endDate: "2025-06-30", participants: 128 },
  { id: "cyc-2", name: "Q1 2025 Review Cycle", status: "closed", startDate: "2025-01-01", endDate: "2025-03-31", participants: 121 },
];

const attendanceRecords: AttendanceRecord[] = [
  { id: "att-1", employeeName: "Ayesha Rahman", workDate: "2025-03-17", clockIn: "08:58", clockOut: "17:05", status: "present" },
  { id: "att-2", employeeName: "Miguel Torres", workDate: "2025-03-17", clockIn: "09:22", clockOut: "18:10", status: "late" },
  { id: "att-3", employeeName: "Sofia Lindqvist", workDate: "2025-03-17", clockIn: "08:45", clockOut: null, status: "on_leave" },
  { id: "att-4", employeeName: "Priya Nair", workDate: "2025-03-17", clockIn: "08:30", clockOut: "17:30", status: "present" },
  { id: "att-5", employeeName: "Daniel Mbeki", workDate: "2025-03-17", clockIn: "08:15", clockOut: "16:45", status: "remote" },
];

const learningCourses: LearningCourse[] = [
  { id: "lms-1", title: "GDPR & Data Protection", category: "Compliance", level: "foundation", estimatedMinutes: 45, enrolled: 118, completionRate: 92 },
  { id: "lms-2", title: "Inclusive Hiring Practices", category: "People Ops", level: "intermediate", estimatedMinutes: 60, enrolled: 64, completionRate: 78 },
  { id: "lms-3", title: "Engineering Leadership", category: "Leadership", level: "advanced", estimatedMinutes: 120, enrolled: 22, completionRate: 55 },
  { id: "lms-4", title: "Security Awareness", category: "Compliance", level: "foundation", estimatedMinutes: 30, enrolled: 128, completionRate: 97 },
];

const benefitPlans: BenefitPlan[] = [
  { id: "ben-1", name: "Health — PPO", provider: "BlueShield", planType: "medical", employeeCost: 180, employerCost: 620, status: "active" },
  { id: "ben-2", name: "Dental", provider: "DeltaDental", planType: "dental", employeeCost: 35, employerCost: 120, status: "active" },
  { id: "ben-3", name: "401(k) Match", provider: "Fidelity", planType: "retirement", employeeCost: 0, employerCost: 240, status: "active" },
];

const equityGrants: EquityGrant[] = [
  { id: "eq-1", employeeName: "Ayesha Rahman", grantType: "rsu", quantity: 400, strikePrice: null, vestingMonths: 48, status: "active" },
  { id: "eq-2", employeeName: "Miguel Torres", grantType: "option", quantity: 2000, strikePrice: 12.5, vestingMonths: 48, status: "active" },
  { id: "eq-3", employeeName: "Sofia Lindqvist", grantType: "rsu", quantity: 600, strikePrice: null, vestingMonths: 48, status: "active" },
];

const expenses: Expense[] = [
  { id: "exp-1", employeeName: "Priya Nair", merchant: "AWS", category: "Software", amount: 2400, currency: "USD", status: "pending" },
  { id: "exp-2", employeeName: "Daniel Mbeki", merchant: "Figma", category: "Software", amount: 180, currency: "USD", status: "approved" },
  { id: "exp-3", employeeName: "Miguel Torres", merchant: "Delta Airlines", category: "Travel", amount: 940, currency: "USD", status: "pending" },
  { id: "exp-4", employeeName: "Ayesha Rahman", merchant: "WeWork", category: "Facilities", amount: 600, currency: "USD", status: "approved" },
];

const pulseSurveys: PulseSurvey[] = [
  { id: "srv-1", title: "Q2 Engagement Pulse", anonymous: true, status: "active", responses: 84, eNPS: 42 },
  { id: "srv-2", title: "Return-to-office sentiment", anonymous: true, status: "closed", responses: 110, eNPS: 18 },
  { id: "srv-3", title: "Manager effectiveness", anonymous: false, status: "draft", responses: 0, eNPS: null },
];

const workforceScenarios: WorkforceScenario[] = [
  { id: "scn-1", name: "Base case", headcountForecast: 132, budgetForecast: 910000, status: "approved" },
  { id: "scn-2", name: "Growth +20%", headcountForecast: 154, budgetForecast: 1080000, status: "draft" },
  { id: "scn-3", name: "Hiring freeze", headcountForecast: 126, budgetForecast: 860000, status: "draft" },
];

const contractorInvoices: ContractorInvoice[] = [
  { id: "inv-1", contractor: "Devs Inc.", invoiceNumber: "INV-2025-014", totalAmount: 12000, currency: "USD", status: "submitted" },
  { id: "inv-2", contractor: "Design Studio Co.", invoiceNumber: "INV-2025-015", totalAmount: 4800, currency: "USD", status: "approved" },
  { id: "inv-3", contractor: "Ops Freelance", invoiceNumber: "INV-2025-016", totalAmount: 3200, currency: "EUR", status: "draft" },
];

const offboardingCases: OffboardingCase[] = [
  { id: "off-1", employeeName: "Omar Haddad", exitDate: "2025-03-28", status: "in_progress", tasksDone: 6, tasksTotal: 9 },
  { id: "off-2", employeeName: "Emma Johnson", exitDate: "2025-04-11", status: "planned", tasksDone: 0, tasksTotal: 9 },
];

const orgNodes: OrgNode[] = [
  { id: "org-1", name: "Ayesha Rahman", title: "CTO", managerId: null },
  { id: "org-2", name: "Miguel Torres", title: "Engineering Lead", managerId: "org-1" },
  { id: "org-3", name: "Daniel Mbeki", title: "Design Lead", managerId: "org-1" },
  { id: "org-4", name: "Sofia Lindqvist", title: "People Ops", managerId: null },
  { id: "org-5", name: "Priya Nair", title: "Payroll Analyst", managerId: "org-4" },
];

const assets: Asset[] = [
  { id: "ast-1", name: "MacBook Pro 14", category: "Laptop", status: "assigned", assignee: "Ayesha Rahman" },
  { id: "ast-2", name: "Dell UltraSharp 27", category: "Monitor", status: "assigned", assignee: "Miguel Torres" },
  { id: "ast-3", name: "YubiKey 5C", category: "Security", status: "available", assignee: null },
  { id: "ast-4", name: "Sony WH-1000XM5", category: "Peripheral", status: "maintenance", assignee: null },
];

const documents: DocumentRecord[] = [
  { id: "doc-1", name: "Employee Handbook 2025.pdf", kind: "policy", owner: "People Ops", sizeKb: 1240, uploadedAt: "2025-01-15" },
  { id: "doc-2", name: "Offer Letter Template.docx", kind: "template", owner: "Recruitment", sizeKb: 96, uploadedAt: "2025-02-03" },
  { id: "doc-3", name: "Onboarding Checklist.pdf", kind: "checklist", owner: "People Ops", sizeKb: 310, uploadedAt: "2025-03-01" },
];

const salaryBands: SalaryBand[] = [
  { id: "band-1", level: "L3", title: "Engineer", min: 90000, mid: 120000, max: 150000, currency: "USD" },
  { id: "band-2", level: "L4", title: "Senior Engineer", min: 130000, mid: 165000, max: 200000, currency: "USD" },
  { id: "band-3", level: "L5", title: "Staff Engineer", min: 175000, mid: 210000, max: 250000, currency: "USD" },
];

const auditEntries: AuditEntry[] = [
  { id: "aud-1", actor: "Ayesha Rahman", action: "employee.create", entityType: "employee", entityId: "emp-4", createdAt: "2025-03-17T10:00:00Z" },
  { id: "aud-2", actor: "Sofia Lindqvist", action: "leave.resolve", entityType: "leave_request", entityId: "leave-1", createdAt: "2025-03-17T09:30:00Z" },
  { id: "aud-3", actor: "Priya Nair", action: "payroll.execute", entityType: "payroll_run", entityId: "run-001", createdAt: "2025-03-16T18:00:00Z" },
  { id: "aud-4", actor: "Ayesha Rahman", action: "candidate.move", entityType: "candidate", entityId: "cand-3", createdAt: "2025-03-16T14:20:00Z" },
];

const screeningRecords: ScreeningRecord[] = [
  { id: "scr-1", candidateName: "Lena Kowalski", role: "Backend Engineer", score: 78, recommendation: "hold", reviewedAt: "2025-03-17" },
  { id: "scr-2", candidateName: "Theo Dubois", role: "Backend Engineer", score: 86, recommendation: "advance", reviewedAt: "2025-03-16" },
  { id: "scr-3", candidateName: "Amara Okafor", role: "Backend Engineer", score: 91, recommendation: "advance", reviewedAt: "2025-03-16" },
];

/* ------------------------------------------------------------------ */
/* Getters (memory adapter → seed fallback)                            */
/* ------------------------------------------------------------------ */

/**
 * Reads rows through the memory adapter with a graceful empty/error fallback.
 * Returns `null` when the read failed; callers then fall back to the
 * deterministic seed data so pages always render content — empty Supabase
 * tables (e.g. a brand-new organization before any writes) and transient
 * connection blips never produce blank screens.
 */
async function selectRows(
  memory: MemoryAdapter,
  table: string,
  filter: RowFilter | undefined,
): Promise<Row[] | null> {
  try {
    return await memory.select<Row>(table, filter);
  } catch {
    return null;
  }
}

async function shouldUseSeed(): Promise<boolean> {
  const settings = await readSettings();
  if (settings.memory.provider !== "supabase") {
    return false;
  }
  return !hasSupabaseEnv();
}

async function orgFilter(memory: { provider: string }) {
  if (memory.provider !== "supabase") {
    return undefined;
  }
  const orgId = (await getCurrentUser()).organizationId;
  return orgId ? { column: "organization_id", value: orgId } : undefined;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}
function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getOkrGoals(): Promise<OKRGoal[]> {
  if (await shouldUseSeed()) return okrGoals;
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("goals", await orgFilter(memory));
  return rows.map((r) => ({
    id: text(r.id), employeeName: text(r.employee_name), title: text(r.title),
    objective: text(r.objective), status: text(r.status, "not_started") as GoalStatus,
    progress: num(r.progress), dueDate: text(r.due_date),
  }));
}

export async function getPerformanceCycles(): Promise<PerformanceCycle[]> {
  if (await shouldUseSeed()) return performanceCycles;
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("performance_cycles", await orgFilter(memory));
  return rows.map((r) => ({
    id: text(r.id), name: text(r.name), status: text(r.status, "draft") as PerformanceCycle["status"],
    startDate: text(r.start_date), endDate: text(r.end_date), participants: num(r.participants),
  }));
}

export async function getAttendanceRecords(): Promise<AttendanceRecord[]> {
  if (await shouldUseSeed()) return attendanceRecords;
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("attendance_records", await orgFilter(memory));
  return rows.map((r) => ({
    id: text(r.id), employeeName: text(r.employee_name), workDate: text(r.work_date),
    clockIn: text(r.clock_in), clockOut: typeof r.clock_out === "string" ? r.clock_out : null,
    status: text(r.status, "present") as AttendanceRecord["status"],
  }));
}

export async function getLearningCourses(): Promise<LearningCourse[]> {
  if (await shouldUseSeed()) return learningCourses;
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("learning_courses", await orgFilter(memory));
  return rows.map((r) => ({
    id: text(r.id), title: text(r.title), category: text(r.category),
    level: text(r.level, "foundation") as LearningCourse["level"],
    estimatedMinutes: num(r.estimated_minutes), enrolled: num(r.enrolled), completionRate: num(r.completion_rate),
  }));
}

export async function getBenefitPlans(): Promise<BenefitPlan[]> {
  if (await shouldUseSeed()) return benefitPlans;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "benefit_plans", await orgFilter(memory));
  if (!rows || rows.length === 0) return benefitPlans;
  return rows.map((r) => ({
    id: text(r.id), name: text(r.name), provider: text(r.provider),
    planType: text(r.plan_type), employeeCost: num(r.employee_cost), employerCost: num(r.employer_cost),
    status: text(r.status, "draft") as BenefitPlan["status"],
  }));
}

export async function getEquityGrants(): Promise<EquityGrant[]> {
  if (await shouldUseSeed()) return equityGrants;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "equity_grants", await orgFilter(memory));
  if (!rows || rows.length === 0) return equityGrants;
  return rows.map((r) => ({
    id: text(r.id), employeeName: text(r.employee_name), grantType: text(r.grant_type, "option") as EquityGrant["grantType"],
    quantity: num(r.quantity), strikePrice: typeof r.strike_price === "number" ? r.strike_price : null,
    vestingMonths: num(r.vesting_months), status: text(r.status, "active") as EquityGrant["status"],
  }));
}

export async function getExpenses(): Promise<Expense[]> {
  if (await shouldUseSeed()) return expenses;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "expense_reports", await orgFilter(memory));
  if (!rows || rows.length === 0) return expenses;
  return rows.map((r) => ({
    id: text(r.id), employeeName: text(r.employee_name), merchant: text(r.merchant),
    category: text(r.category), amount: num(r.amount), currency: text(r.currency, "USD"),
    status: text(r.status, "pending") as Expense["status"],
  }));
}

export async function getPulseSurveys(): Promise<PulseSurvey[]> {
  if (await shouldUseSeed()) return pulseSurveys;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "pulse_surveys", await orgFilter(memory));
  if (!rows || rows.length === 0) return pulseSurveys;
  return rows.map((r) => ({
    id: text(r.id), title: text(r.title), anonymous: Boolean(r.anonymous),
    status: text(r.status, "draft") as PulseSurvey["status"], responses: num(r.responses),
    eNPS: typeof r.enps === "number" ? r.enps : null,
  }));
}

export async function getWorkforceScenarios(): Promise<WorkforceScenario[]> {
  if (await shouldUseSeed()) return workforceScenarios;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "workforce_scenarios", await orgFilter(memory));
  if (!rows || rows.length === 0) return workforceScenarios;
  return rows.map((r) => ({
    id: text(r.id), name: text(r.name), headcountForecast: num(r.headcount_forecast),
    budgetForecast: num(r.budget_forecast), status: text(r.status, "draft") as WorkforceScenario["status"],
  }));
}

export async function getContractorInvoices(): Promise<ContractorInvoice[]> {
  if (await shouldUseSeed()) return contractorInvoices;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "contractor_invoices", await orgFilter(memory));
  if (!rows || rows.length === 0) return contractorInvoices;
  return rows.map((r) => ({
    id: text(r.id), contractor: text(r.contractor), invoiceNumber: text(r.invoice_number),
    totalAmount: num(r.total_amount), currency: text(r.currency, "USD"),
    status: text(r.status, "draft") as ContractorInvoice["status"],
  }));
}

export async function getOffboardingCases(): Promise<OffboardingCase[]> {
  if (await shouldUseSeed()) return offboardingCases;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "offboarding_cases", await orgFilter(memory));
  if (!rows || rows.length === 0) return offboardingCases;
  return rows.map((r) => ({
    id: text(r.id), employeeName: text(r.employee_name), exitDate: text(r.exit_date),
    status: text(r.status, "planned") as OffboardingCase["status"],
    tasksDone: num(r.tasks_done), tasksTotal: num(r.tasks_total),
  }));
}

export async function getOrgChart(): Promise<OrgNode[]> {
  if (await shouldUseSeed()) return orgNodes;
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("employees", await orgFilter(memory));
  return rows.map((r) => ({
    id: text(r.id), name: `${text(r.first_name)} ${text(r.last_name)}`,
    title: text(r.title, text(r.role)), managerId: typeof r.manager_id === "string" ? r.manager_id : null,
  }));
}

export async function getAssets(): Promise<Asset[]> {
  if (await shouldUseSeed()) return assets;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "assets", await orgFilter(memory));
  if (!rows || rows.length === 0) return assets;
  return rows.map((r) => ({
    id: text(r.id), name: text(r.name), category: text(r.category),
    status: text(r.status, "available") as Asset["status"],
    assignee: typeof r.assignee === "string" ? r.assignee : null,
  }));
}

export async function getDocuments(): Promise<DocumentRecord[]> {
  if (await shouldUseSeed()) return documents;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "documents", await orgFilter(memory));
  if (!rows || rows.length === 0) return documents;
  return rows.map((r) => ({
    id: text(r.id), name: text(r.name), kind: text(r.kind), owner: text(r.owner),
    sizeKb: num(r.size_kb), uploadedAt: text(r.uploaded_at),
  }));
}

export async function getSalaryBands(): Promise<SalaryBand[]> {
  if (await shouldUseSeed()) return salaryBands;
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("compensation_bands", await orgFilter(memory));
  return rows.map((r) => ({
    id: text(r.id), level: text(r.level), title: text(r.title),
    min: num(r.min_salary), mid: num(r.mid_salary), max: num(r.max_salary), currency: text(r.currency, "USD"),
  }));
}

export async function getAuditEntries(): Promise<AuditEntry[]> {
  if (await shouldUseSeed()) return auditEntries;
  // Typed Supabase path (legacy service-layer adapter): reads audit_logs via
  // the canonical client + field-map, so return types match database.types.ts.
  const typed = await getAuditEntriesTyped();
  if (typed.length > 0) {
    return typed.map((r) => ({
      id: r.id,
      actor: r.actor_id ?? "system",
      action: r.action,
      entityType: r.entity,
      entityId: r.entity_id ?? "",
      createdAt: r.created_at,
    }));
  }
  const memory = await getMemoryAdapter();
  const rows = await memory.select<Row>("audit_logs", await orgFilter(memory));
  return rows.map((r) => ({
    id: text(r.id), actor: text(r.actor_email, text(r.actor_id)), action: text(r.action),
    entityType: text(r.entity_type), entityId: text(r.entity_id), createdAt: text(r.created_at),
  }));
}

export async function getScreeningRecords(): Promise<ScreeningRecord[]> {
  if (await shouldUseSeed()) return screeningRecords;
  const memory = await getMemoryAdapter();
  const rows = await selectRows(memory, "candidate_ai_assessments", await orgFilter(memory));
  if (!rows || rows.length === 0) return screeningRecords;
  return rows.map((r) => ({
    id: text(r.id), candidateName: text(r.candidate_name), role: text(r.role),
    score: num(r.score), recommendation: text(r.recommendation, "hold") as ScreeningRecord["recommendation"],
    reviewedAt: text(r.reviewed_at),
  }));
}
