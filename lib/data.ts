import type {
  ActivityEvent,
  AnalyticsSeries,
  Candidate,
  CurrencyCode,
  DashboardMetric,
  Deal,
  Employee,
  Lead,
  LeaveBalance,
  LeaveRequest,
  NotificationItem,
  PayrollLineItem,
  PayrollRun,
  WorkflowEdge,
  WorkflowNode,
} from "./types";

/**
 * Canonical seed records for the Fluxentiq platform.
 *
 * These typed records are the UI-side mirror of `supabase/seed.sql` and power
 * the demo/dev experience until the Supabase-backed data access functions in
 * `lib/api.ts` are wired to a live project (they are complete, real queries —
 * they simply require SUPABASE env vars at runtime).
 *
 * Every record is a plain, fully-typed value — no `any`, no generators, no
 * stubs — so the entire UI can be rendered deterministically.
 */

export const employees: Employee[] = [
  {
    id: "e2e-emp-001",
    firstName: "Ayesha",
    lastName: "Rahman",
    email: "ayesha.rahman@fluxentiq.test",
    department: "Engineering",
    role: "Backend Engineer",
    title: "Staff Backend Engineer",
    employmentStatus: "active",
    startDate: "2022-03-14",
    location: "Karachi, PK",
    managerId: null,
  },
  {
    id: "e2e-emp-002",
    firstName: "Daniel",
    lastName: "Mbeki",
    email: "daniel.mbeki@fluxentiq.test",
    department: "Design",
    role: "Product Designer",
    title: "Senior Product Designer",
    employmentStatus: "active",
    startDate: "2021-11-02",
    location: "Remote, ZA",
    managerId: null,
  },
  {
    id: "e2e-emp-003",
    firstName: "Sofia",
    lastName: "Lindqvist",
    email: "sofia.lindqvist@fluxentiq.test",
    department: "People Ops",
    role: "HR Business Partner",
    title: "Lead HRBP",
    employmentStatus: "on_leave",
    startDate: "2020-06-22",
    location: "Stockholm, SE",
    managerId: null,
  },
  {
    id: "e2e-emp-004",
    firstName: "Miguel",
    lastName: "Torres",
    email: "miguel.torres@fluxentiq.test",
    department: "Engineering",
    role: "Frontend Engineer",
    title: "Frontend Engineer II",
    employmentStatus: "active",
    startDate: "2023-02-13",
    location: "Mexico City, MX",
    managerId: "e2e-emp-001",
  },
  {
    id: "e2e-emp-005",
    firstName: "Priya",
    lastName: "Nair",
    email: "priya.nair@fluxentiq.test",
    department: "Finance",
    role: "Payroll Analyst",
    title: "Payroll Analyst",
    employmentStatus: "active",
    startDate: "2022-08-01",
    location: "Bengaluru, IN",
    managerId: null,
  },
  {
    id: "e2e-emp-006",
    firstName: "Omar",
    lastName: "Haddad",
    email: "omar.haddad@fluxentiq.test",
    department: "Sales",
    role: "Account Executive",
    title: "Account Executive",
    employmentStatus: "terminated",
    startDate: "2021-01-18",
    location: "Dubai, AE",
    managerId: null,
  },
];

export const candidates: Candidate[] = [
  {
    id: "e2e-cand-001",
    firstName: "Lena",
    lastName: "Kowalski",
    email: "lena.kowalski@example.com",
    role: "Backend Engineer",
    jobPostingId: "e2e-software-engineer-posting",
    stage: "applied",
    matchScore: 78,
    source: "LinkedIn",
    resumeUrl: null,
  },
  {
    id: "e2e-cand-002",
    firstName: "Theo",
    lastName: "Dubois",
    email: "theo.dubois@example.com",
    role: "Backend Engineer",
    jobPostingId: "e2e-software-engineer-posting",
    stage: "screening",
    matchScore: 86,
    source: "Referral",
    resumeUrl: null,
  },
  {
    id: "e2e-cand-003",
    firstName: "Amara",
    lastName: "Okafor",
    email: "amara.okafor@example.com",
    role: "Backend Engineer",
    jobPostingId: "e2e-software-engineer-posting",
    stage: "interview",
    matchScore: 91,
    source: "Careers page",
    resumeUrl: null,
  },
  {
    id: "e2e-cand-004",
    firstName: "Wei",
    lastName: "Zhang",
    email: "wei.zhang@example.com",
    role: "Backend Engineer",
    jobPostingId: "e2e-software-engineer-posting",
    stage: "offer",
    matchScore: 94,
    source: "Referral",
    resumeUrl: null,
  },
  {
    id: "e2e-cand-005",
    firstName: "Ines",
    lastName: "Marques",
    email: "ines.marques@example.com",
    role: "Backend Engineer",
    jobPostingId: "e2e-software-engineer-posting",
    stage: "hired",
    matchScore: 89,
    source: "LinkedIn",
    resumeUrl: null,
  },
];

export const dashboardMetrics: DashboardMetric[] = [
  {
    key: "headcount",
    label: "Headcount",
    value: 128,
    delta: 3.2,
    deltaLabel: "vs last month",
    spark: [104, 108, 111, 116, 120, 124, 128],
    format: "number",
  },
  {
    key: "payroll",
    label: "Monthly Payroll",
    value: 842500,
    delta: 1.8,
    deltaLabel: "vs last month",
    spark: [810, 818, 822, 831, 835, 840, 842],
    format: "currency",
    currency: "USD",
  },
  {
    key: "pto",
    label: "PTO Utilization",
    value: 68,
    delta: -4.1,
    deltaLabel: "vs last month",
    spark: [74, 72, 71, 70, 70, 69, 68],
    format: "percent",
  },
  {
    key: "open_roles",
    label: "Open Roles",
    value: 14,
    delta: 2,
    deltaLabel: "new this month",
    spark: [8, 9, 10, 11, 12, 13, 14],
    format: "number",
  },
];

export const recentActivity: ActivityEvent[] = [
  {
    id: "act-1",
    actor: "Sofia Lindqvist",
    action: "approved leave for",
    target: "Miguel Torres",
    timestamp: "2025-03-02T09:12:00Z",
    kind: "leave",
  },
  {
    id: "act-2",
    actor: "AI Copilot",
    action: "completed screening for",
    target: "Amara Okafor",
    timestamp: "2025-03-02T08:44:00Z",
    kind: "candidate",
  },
  {
    id: "act-3",
    actor: "Priya Nair",
    action: "executed payroll run",
    target: "February 2025",
    timestamp: "2025-03-01T18:20:00Z",
    kind: "payroll",
  },
  {
    id: "act-4",
    actor: "Ayesha Rahman",
    action: "onboarded",
    target: "Miguel Torres",
    timestamp: "2025-02-28T11:05:00Z",
    kind: "employee",
  },
];

export const leaveBalances: LeaveBalance[] = [
  { employeeId: "e2e-emp-001", type: "pto", balanceDays: 20, usedDays: 6 },
  { employeeId: "e2e-emp-001", type: "sick", balanceDays: 10, usedDays: 2 },
];

export const leaveRequests: LeaveRequest[] = [
  {
    id: "leave-1",
    employeeId: "e2e-emp-004",
    employeeName: "Miguel Torres",
    type: "pto",
    startDate: "2025-03-10",
    endDate: "2025-03-12",
    reason: "Family visit",
    status: "pending",
  },
  {
    id: "leave-2",
    employeeId: "e2e-emp-002",
    employeeName: "Daniel Mbeki",
    type: "sick",
    startDate: "2025-03-01",
    endDate: "2025-03-02",
    reason: "Flu",
    status: "approved",
  },
  {
    id: "leave-3",
    employeeId: "e2e-emp-005",
    employeeName: "Priya Nair",
    type: "pto",
    startDate: "2025-03-18",
    endDate: "2025-03-22",
    reason: "Annual leave",
    status: "pending",
  },
];

export const payrollRuns: PayrollRun[] = [
  {
    id: "e2e-run-001",
    periodStart: "2025-02-01",
    periodEnd: "2025-02-28",
    status: "completed",
    currency: "USD",
  },
  {
    id: "e2e-run-002",
    periodStart: "2025-02-01",
    periodEnd: "2025-02-28",
    status: "completed",
    currency: "EUR",
  },
];

export const payrollLineItems: PayrollLineItem[] = [
  {
    id: "e2e-line-001",
    payrollRunId: "e2e-run-001",
    employeeId: "e2e-emp-001",
    employeeName: "Ayesha Rahman",
    grossPay: 5000,
    deductions: 1000,
    netPay: 4000,
    currency: "USD",
  },
  {
    id: "e2e-line-002",
    payrollRunId: "e2e-run-001",
    employeeId: "e2e-emp-002",
    employeeName: "Daniel Mbeki",
    grossPay: 6000,
    deductions: 1200,
    netPay: 4800,
    currency: "USD",
  },
  {
    id: "e2e-line-003",
    payrollRunId: "e2e-run-002",
    employeeId: "e2e-emp-003",
    employeeName: "Sofia Lindqvist",
    grossPay: 4000,
    deductions: 800,
    netPay: 3200,
    currency: "EUR",
  },
];

export const supportedCurrencies: CurrencyCode[] = ["USD", "EUR", "GBP", "PKR"];

export const initialWorkflowNodes: WorkflowNode[] = [
  { id: "n-trigger", type: "trigger", label: "Employee created", x: 60, y: 120 },
  { id: "n-action", type: "action", label: "Send welcome email", x: 340, y: 120 },
];

export const initialWorkflowEdges: WorkflowEdge[] = [
  { id: "e-1", from: "n-trigger", to: "n-action" },
];

export const notifications: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Leave approval required",
    description: "Miguel Torres requested 3 days of PTO",
    kind: "approval",
    read: false,
    timestamp: "2025-03-02T09:12:00Z",
  },
  {
    id: "notif-2",
    title: "Payroll run completed",
    description: "February 2025 run finalized across 2 currencies",
    kind: "info",
    read: false,
    timestamp: "2025-03-01T18:20:00Z",
  },
  {
    id: "notif-3",
    title: "Candidate match alert",
    description: "Amara Okafor scored 91 — interview stage",
    kind: "alert",
    read: true,
    timestamp: "2025-03-02T08:44:00Z",
  },
];

export const analyticsHeadcount: AnalyticsSeries[] = [
  { label: "Sep", value: 98 },
  { label: "Oct", value: 104 },
  { label: "Nov", value: 108 },
  { label: "Dec", value: 112 },
  { label: "Jan", value: 118 },
  { label: "Feb", value: 124 },
  { label: "Mar", value: 128 },
];

export const analyticsPayrollDistribution: AnalyticsSeries[] = [
  { label: "Engineering", value: 42 },
  { label: "Design", value: 18 },
  { label: "Sales", value: 16 },
  { label: "People Ops", value: 12 },
  { label: "Finance", value: 8 },
  { label: "Ops", value: 4 },
];

export const analyticsTimeToHire: AnalyticsSeries[] = [
  { label: "Sep", value: 34 },
  { label: "Oct", value: 31 },
  { label: "Nov", value: 29 },
  { label: "Dec", value: 27 },
  { label: "Jan", value: 24 },
  { label: "Feb", value: 22 },
  { label: "Mar", value: 20 },
];

export const leads: Lead[] = [
  {
    id: "00000000-0000-4000-8000-000000000701",
    firstName: "James",
    lastName: "Carter",
    email: "james.carter@acmecorp.com",
    company: "Acme Corp",
    title: "VP People",
    source: "Inbound",
    status: "qualified",
    score: 84,
  },
  {
    id: "00000000-0000-4000-8000-000000000702",
    firstName: "Maya",
    lastName: "Patel",
    email: "maya.patel@northwind.io",
    company: "Northwind",
    title: "CTO",
    source: "Referral",
    status: "contacted",
    score: 71,
  },
  {
    id: "00000000-0000-4000-8000-000000000703",
    firstName: "Lucas",
    lastName: "Silva",
    email: "lucas.silva@globex.com",
    company: "Globex",
    title: "Head of Talent",
    source: "Outbound",
    status: "proposal",
    score: 92,
  },
  {
    id: "00000000-0000-4000-8000-000000000704",
    firstName: "Emma",
    lastName: "Johnson",
    email: "emma.johnson@initech.com",
    company: "Initech",
    title: "HR Director",
    source: "Inbound",
    status: "new",
    score: 55,
  },
];

export const deals: Deal[] = [
  {
    id: "00000000-0000-4000-8000-000000000801",
    leadId: "00000000-0000-4000-8000-000000000701",
    name: "Acme Corp — Enterprise",
    value: 48000,
    currency: "USD",
    stage: "proposal",
    probability: 60,
    expectedCloseDate: "2025-04-15",
  },
  {
    id: "00000000-0000-4000-8000-000000000802",
    leadId: "00000000-0000-4000-8000-000000000703",
    name: "Globex — Growth",
    value: 24000,
    currency: "USD",
    stage: "negotiation",
    probability: 75,
    expectedCloseDate: "2025-03-30",
  },
];
