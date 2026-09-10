import "server-only";

import { getCandidates, getDashboardMetrics, getEmployees, getLeaveRequests } from "@/lib/api";
import {
  getAttendanceRecords,
  getDocuments,
  getExpenses,
  getOffboardingCases,
  getOkrGoals,
  getPulseSurveys,
} from "@/lib/domain";
import { detectExpenseAnomalies } from "@/lib/analytics/predictive";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { getRecruitmentOverviewAction } from "@/app/actions/recruitmentActions";
import { listDailyTasksAction } from "@/app/actions/workflowActions";
import { sortInsights, type Insight } from "./types";
import {
  attendanceSignals,
  documentSignals,
  engagementSignals,
  expenseAnomalySignals,
  headcountSignals,
  interviewSignals,
  leaveSignals,
  offboardingSignals,
  performanceSignals,
  recruitmentSignals,
  taskHealthSignals,
  type SignalContext,
} from "./signals";

/**
 * Intelligence aggregator (server-only).
 *
 * Loads every signal source through the existing domain layer (live Supabase
 * with seed fallback where the domain provides it; server actions where it
 * does not), maps rows to signal inputs, runs the deterministic rules, and
 * returns the ranked insight set.
 *
 * Resilience is explicit: each source is settled independently, so one
 * failing loader degrades its categories to INSUFFICIENT_DATA instead of
 * failing the whole call. The `sources` array tells the caller exactly which
 * sources contributed, so renderers never present partial data as complete.
 *
 * Authorization lives at the route layer (HR_ADMIN+): this module only reads
 * through already org-scoped getters.
 */

export interface InsightSource {
  name: string;
  ok: boolean;
  count: number;
  seedFallback: boolean;
}

export interface InsightSet {
  insights: Insight[];
  sources: InsightSource[];
  generatedAt: string;
}

async function settle<T>(name: string, seedFallback: boolean, loader: () => Promise<T[]>): Promise<{ source: InsightSource; rows: T[] }> {
  try {
    const rows = await loader();
    return { source: { name, ok: true, count: rows.length, seedFallback }, rows };
  } catch {
    return { source: { name, ok: false, count: 0, seedFallback }, rows: [] };
  }
}

export async function getInsightSet(): Promise<InsightSet> {
  const generatedAt = new Date().toISOString();
  const seedFallback = !hasSupabaseEnv();
  const ctxFor = (source: string): SignalContext => ({ now: generatedAt, source, seedFallback });

  const [attendance, leave, employees, goals, surveys, offboarding, documents, expenses] = await Promise.all([
    settle("attendance_records", seedFallback, getAttendanceRecords),
    settle("leave_requests", seedFallback, getLeaveRequests),
    settle("employees", seedFallback, getEmployees),
    settle("goals", seedFallback, getOkrGoals),
    settle("pulse_surveys", seedFallback, getPulseSurveys),
    settle("offboarding_cases", seedFallback, getOffboardingCases),
    settle("documents", seedFallback, getDocuments),
    settle("expense_reports", seedFallback, getExpenses),
  ]);

  // Recruitment overview + daily tasks come from server actions that require
  // a live Supabase project; in demo mode they fail and the categories below
  // degrade to INSUFFICIENT_DATA honestly.
  let jobTitleById = new Map<string, string>();
  let candidateNameById = new Map<string, string>();
  let pipeline: Array<{ jobId: string; jobTitle: string; stage: string; stageChangedAt: string; candidateName: string }> = [];
  let interviews: Array<{ candidateName: string; jobTitle: string; scheduledStart: string; status: string }> = [];
  let recruitmentOk = false;
  try {
    const overview = await getRecruitmentOverviewAction();
    if (overview.success) {
      recruitmentOk = true;
      jobTitleById = new Map(overview.data.jobs.map((j) => [j.id, j.title]));
      candidateNameById = new Map(overview.data.candidates.map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]));
      pipeline = overview.data.applications.map((a) => ({
        jobId: a.job_opening_id,
        jobTitle: jobTitleById.get(a.job_opening_id) ?? "Unknown role",
        stage: a.stage,
        stageChangedAt: a.stage_changed_at ?? a.applied_at ?? generatedAt,
        candidateName: candidateNameById.get(a.candidate_id) ?? "Unknown candidate",
      }));
      const applicationById = new Map(overview.data.applications.map((a) => [a.id, a]));
      interviews = overview.data.interviews.map((i) => {
        const app = applicationById.get(i.application_id);
        return {
          candidateName: app ? (candidateNameById.get(app.candidate_id) ?? "Unknown candidate") : "Unknown candidate",
          jobTitle: app ? (jobTitleById.get(app.job_opening_id) ?? "Unknown role") : "Unknown role",
          scheduledStart: i.scheduled_start,
          status: i.status,
        };
      });
    }
  } catch {
    recruitmentOk = false;
  }

  let workflowTasks: Array<{ status: string; taskDate: string; templateTitle?: string }> = [];
  let onboardingTasks: Array<{ status: string; taskDate: string; templateTitle?: string }> = [];
  let tasksOk = false;
  try {
    const tasks = await listDailyTasksAction({ pageSize: 200 });
    if (tasks.success) {
      tasksOk = true;
      for (const t of tasks.data.rows) {
        const row = { status: t.status, taskDate: t.taskDate, templateTitle: t.templateTitle ?? undefined };
        if ((t.templateTitle ?? "").toLowerCase().includes("onboard")) onboardingTasks.push(row);
        else workflowTasks.push(row);
      }
    }
  } catch {
    tasksOk = false;
  }

  // Candidate fallback: when the recruitment action path is unavailable but
  // the memory-backed candidate list exists, still feed stages (without
  // timestamps they can only drive the bottleneck rule).
  if (!recruitmentOk) {
    try {
      const candidates = await getCandidates();
      if (candidates.length > 0) {
        pipeline = candidates.map((c) => ({
          jobId: c.jobPostingId,
          jobTitle: c.role,
          stage: c.stage,
          stageChangedAt: generatedAt,
          candidateName: `${c.firstName} ${c.lastName}`.trim(),
        }));
      }
    } catch {
      // Leave the pipeline empty → honest INSUFFICIENT_DATA.
    }
  }

  // Touch the metrics loader so headcount deltas stay available to future
  // signals; failures are ignored (no signal consumes it yet).
  void getDashboardMetrics().catch(() => []);

  const insights: Insight[] = [
    ...attendanceSignals(
      attendance.rows.map((r) => ({ employeeName: r.employeeName, workDate: r.workDate, status: r.status })),
      ctxFor("attendance_records"),
    ),
    ...leaveSignals(
      leave.rows.map((r) => ({ employeeName: r.employeeName, type: r.type, startDate: r.startDate, endDate: r.endDate, status: r.status })),
      ctxFor("leave_requests"),
    ),
    ...recruitmentSignals(pipeline, ctxFor(recruitmentOk ? "applications" : "candidates")),
    ...interviewSignals(interviews, ctxFor("interviews")),
    ...headcountSignals(
      employees.rows.map((e) => ({ department: e.department, employmentStatus: e.employmentStatus, startDate: e.startDate })),
      ctxFor("employees"),
    ),
    ...performanceSignals(
      goals.rows.map((g) => ({ employeeName: g.employeeName, title: g.title, status: g.status, dueDate: g.dueDate })),
      ctxFor("goals"),
    ),
    ...engagementSignals(
      surveys.rows.map((s) => ({ eNPS: s.eNPS, responses: s.responses, status: s.status })),
      ctxFor("pulse_surveys"),
    ),
    ...offboardingSignals(
      offboarding.rows.map((c) => ({ employeeName: c.employeeName, exitDate: c.exitDate, status: c.status, tasksDone: c.tasksDone, tasksTotal: c.tasksTotal })),
      ctxFor("offboarding_cases"),
    ),
    ...documentSignals(
      documents.rows.map((d) => ({ name: d.name, kind: d.kind, uploadedAt: d.uploadedAt })),
      ctxFor("documents"),
    ),
    ...expenseAnomalySignals(detectExpenseAnomalies(expenses.rows), ctxFor("expense_reports")),
    ...taskHealthSignals(workflowTasks, "workflows", ctxFor("daily_tasks"), "/automations"),
    ...taskHealthSignals(onboardingTasks, "onboarding", ctxFor("daily_tasks"), "/onboarding"),
  ];

  const sources: InsightSource[] = [
    attendance.source,
    leave.source,
    employees.source,
    goals.source,
    surveys.source,
    offboarding.source,
    documents.source,
    expenses.source,
    { name: "applications", ok: recruitmentOk, count: pipeline.length, seedFallback },
    { name: "interviews", ok: recruitmentOk, count: interviews.length, seedFallback },
    { name: "daily_tasks", ok: tasksOk, count: workflowTasks.length + onboardingTasks.length, seedFallback },
  ];

  return { insights: sortInsights(insights), sources, generatedAt };
}
