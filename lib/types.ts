/**
 * Canonical domain types for the Fluxentiq AI HR platform.
 *
 * These mirror the Supabase schema (single source of truth) and are shared
 * between the UI layer, the server data access functions, and the Python
 * `server.py` bridge payloads.
 */

export type EmploymentStatus = "active" | "on_leave" | "terminated";
export type EmployeeRole = "employee" | "manager" | "admin";

export type OrgRole = "owner" | "admin" | "manager" | "member";

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  plan: "free" | "pro" | "enterprise";
  billingStatus: string;
  createdAt: string;
}

export interface OrgMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: OrgRole;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  role: string;
  title: string;
  employmentStatus: EmploymentStatus;
  startDate: string;
  location: string;
  managerId: string | null;
}

export type RecruitmentStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  jobPostingId: string;
  stage: RecruitmentStage;
  matchScore: number;
  source: string;
  resumeUrl: string | null;
}

export type Recommendation = "advance" | "hold" | "reject";

export interface AiEvaluation {
  candidateId: string;
  candidateName: string;
  score: number;
  summary: string;
  recommendation: Recommendation;
  generatedAt: string;
}

export type LeaveType = "pto" | "sick" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
}

export interface LeaveBalance {
  employeeId: string;
  type: "pto" | "sick";
  balanceDays: number;
  usedDays: number;
}

export type PayrollRunStatus = "draft" | "processing" | "completed" | "failed";

export interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  currency: string;
}

export interface PayrollLineItem {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  grossPay: number;
  deductions: number;
  netPay: number;
  currency: string;
}

export interface DashboardMetric {
  key: "headcount" | "payroll" | "pto" | "open_roles";
  label: string;
  value: number;
  delta: number;
  deltaLabel: string;
  spark: number[];
  format: "number" | "currency" | "percent";
  currency?: string;
}

export interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  kind: "employee" | "candidate" | "leave" | "payroll" | "workflow";
}

export type WorkflowNodeType = "trigger" | "action" | "condition" | "delay";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  x: number;
  y: number;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
}

export type CurrencyCode = "USD" | "EUR" | "GBP" | "PKR";

export type CopilotActionKind = "navigate" | "approve" | "view" | "run";

export interface CopilotAction {
  id: string;
  title: string;
  kind: CopilotActionKind;
  target: string;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: CopilotAction[];
  executions: string[];
  createdAt: string;
}

export interface AnalyticsSeries {
  label: string;
  value: number;
}

export type AnalyticsChartKey =
  | "headcount"
  | "attrition"
  | "payroll"
  | "leave"
  | "recruitment";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  source: string;
  status: LeadStatus;
  score: number;
}

export type DealStage =
  | "discovery"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export interface Deal {
  id: string;
  leadId: string | null;
  name: string;
  value: number;
  currency: string;
  stage: DealStage;
  probability: number;
  expectedCloseDate: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  kind: "approval" | "alert" | "info";
  read: boolean;
  timestamp: string;
}
