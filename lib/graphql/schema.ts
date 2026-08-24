import "server-only";
import {
  getEmployees,
  getCandidates,
  getLeads,
  getDeals,
  getPayrollRuns,
  getPayrollLineItems,
} from "@/lib/api";
import {
  getOkrGoals,
  getAttendanceRecords,
  getLearningCourses,
  getBenefitPlans,
  getEquityGrants,
  getExpenses,
  getPulseSurveys,
  getWorkforceScenarios,
  getContractorInvoices,
  getOffboardingCases,
  getAssets,
  getDocuments,
  getSalaryBands,
  getAuditEntries,
  getScreeningRecords,
} from "@/lib/domain";

/**
 * GraphQL schema for the Fluxentiq platform.
 *
 * A thin GraphQL layer over the SAME domain getters that power the REST
 * endpoints — one data source, two query languages. This satisfies the
 * "RESTful APIs or GraphQL" requirement without forking the data layer.
 */

export const typeDefs = /* GraphQL */ `
  type Employee {
    id: String!
    firstName: String!
    lastName: String!
    email: String!
    department: String!
    role: String!
    employmentStatus: String!
    location: String!
  }

  type Candidate {
    id: String!
    firstName: String!
    lastName: String!
    email: String!
    role: String!
    stage: String!
    matchScore: Int!
  }

  type Lead {
    id: String!
    firstName: String!
    lastName: String!
    email: String!
    company: String!
    status: String!
    score: Int!
  }

  type Deal {
    id: String!
    name: String!
    value: Float!
    currency: String!
    stage: String!
    probability: Int!
  }

  type Goal {
    id: String!
    employeeName: String!
    title: String!
    objective: String!
    status: String!
    progress: Float!
  }

  type AttendanceRecord {
    id: String!
    employeeName: String!
    workDate: String!
    clockIn: String
    clockOut: String
    status: String!
  }

  type DashboardSummary {
    employees: Int!
    candidates: Int!
    leads: Int!
    deals: Int!
    goals: Int!
  }

  type Query {
    employees: [Employee!]!
    candidates: [Candidate!]!
    leads: [Lead!]!
    deals: [Deal!]!
    goals: [Goal!]!
    attendance: [AttendanceRecord!]!
    payrollRuns: [PayrollRun!]!
    payrollLineItems(runId: String!): [PayrollLineItem!]!
    learningCourses: [LearningCourse!]!
    benefitPlans: [BenefitPlan!]!
    equityGrants: [EquityGrant!]!
    expenses: [Expense!]!
    surveys: [PulseSurvey!]!
    workforceScenarios: [WorkforceScenario!]!
    contractorInvoices: [ContractorInvoice!]!
    offboardingCases: [OffboardingCase!]!
    assets: [Asset!]!
    documents: [Document!]!
    compensationBands: [CompensationBand!]!
    auditEntries: [AuditEntry!]!
    screeningRecords: [ScreeningRecord!]!
    dashboardSummary: DashboardSummary!
  }

  type PayrollRun {
    id: String!
    periodStart: String!
    periodEnd: String!
    status: String!
    currency: String!
  }

  type PayrollLineItem {
    id: String!
    employeeName: String!
    grossPay: Float!
    deductions: Float!
    netPay: Float!
    currency: String!
  }

  type LearningCourse {
    id: String!
    title: String!
    category: String!
    level: String!
    estimatedMinutes: Int!
    enrolled: Int!
    completionRate: Int!
  }

  type BenefitPlan {
    id: String!
    name: String!
    provider: String!
    planType: String!
    employeeCost: Float!
    employerCost: Float!
    status: String!
  }

  type EquityGrant {
    id: String!
    employeeName: String!
    grantType: String!
    quantity: Float!
    strikePrice: Float
    vestingMonths: Int!
    status: String!
  }

  type Expense {
    id: String!
    employeeName: String!
    merchant: String!
    category: String!
    amount: Float!
    currency: String!
    status: String!
  }

  type PulseSurvey {
    id: String!
    title: String!
    anonymous: Boolean!
    status: String!
    responses: Int!
    eNPS: Int
  }

  type WorkforceScenario {
    id: String!
    name: String!
    headcountForecast: Float!
    budgetForecast: Float!
    status: String!
  }

  type ContractorInvoice {
    id: String!
    contractor: String!
    invoiceNumber: String!
    totalAmount: Float!
    currency: String!
    status: String!
  }

  type OffboardingCase {
    id: String!
    employeeName: String!
    exitDate: String!
    status: String!
    tasksDone: Int!
    tasksTotal: Int!
  }

  type Asset {
    id: String!
    name: String!
    category: String!
    status: String!
    assignee: String
  }

  type Document {
    id: String!
    name: String!
    kind: String!
    owner: String!
    sizeKb: Float!
    uploadedAt: String!
  }

  type CompensationBand {
    id: String!
    level: String!
    title: String!
    min: Float!
    mid: Float!
    max: Float!
    currency: String!
  }

  type AuditEntry {
    id: String!
    actor: String!
    action: String!
    entityType: String!
    entityId: String!
    createdAt: String!
  }

  type ScreeningRecord {
    id: String!
    candidateName: String!
    role: String!
    score: Int!
    recommendation: String!
    reviewedAt: String!
  }
`;

export const resolvers = {
  Query: {
    employees: () => getEmployees(),
    candidates: () => getCandidates(),
    leads: () => getLeads(),
    deals: () => getDeals(),
    goals: () => getOkrGoals(),
    attendance: () => getAttendanceRecords(),
    payrollRuns: () => getPayrollRuns(),
    payrollLineItems: (_: unknown, { runId }: { runId: string }) =>
      getPayrollLineItems(runId),
    learningCourses: () => getLearningCourses(),
    benefitPlans: () => getBenefitPlans(),
    equityGrants: () => getEquityGrants(),
    expenses: () => getExpenses(),
    surveys: () => getPulseSurveys(),
    workforceScenarios: () => getWorkforceScenarios(),
    contractorInvoices: () => getContractorInvoices(),
    offboardingCases: () => getOffboardingCases(),
    assets: () => getAssets(),
    documents: () => getDocuments(),
    compensationBands: () => getSalaryBands(),
    auditEntries: () => getAuditEntries(),
    screeningRecords: () => getScreeningRecords(),
    dashboardSummary: async () => {
      const [employees, candidates, leads, deals, goals] = await Promise.all([
        getEmployees(),
        getCandidates(),
        getLeads(),
        getDeals(),
        getOkrGoals(),
      ]);
      return {
        employees: employees.length,
        candidates: candidates.length,
        leads: leads.length,
        deals: deals.length,
        goals: goals.length,
      };
    },
  },
};
