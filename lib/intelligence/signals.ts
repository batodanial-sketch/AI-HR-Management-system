/**
 * Workforce intelligence signals — pure deterministic rules.
 *
 * Each function maps plain data → `Insight[]`. No I/O, no clock reads (the
 * caller passes `now`), no model calls: identical input always yields
 * identical output, which is what makes the findings explainable and the
 * suite deterministic.
 *
 * Thresholds and confidences are documented per rule. Every rule emits an
 * explicit INSUFFICIENT_DATA insight below its minimum sample size instead
 * of guessing.
 */

import {
  INSUFFICIENT_DATA,
  type Insight,
  type InsightCategory,
  type InsightScope,
} from "./types";

export interface SignalContext {
  /** ISO timestamp the source data was read. */
  now: string;
  /** Source table/loader name for freshness attribution. */
  source: string;
  /** True when the source fell back to demo seed data. */
  seedFallback?: boolean;
}

interface Base {
  id: string;
  category: InsightCategory;
  scope: InsightScope;
}

function base(category: InsightCategory, rule: string, scope: InsightScope, ref?: string): Base {
  return { id: ref ? `${category}:${rule}:${ref}` : `${category}:${rule}`, category, scope };
}

function fresh(ctx: SignalContext) {
  return { asOf: ctx.now, source: ctx.source, seedFallback: ctx.seedFallback };
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : 0;
}

/* ── attendance ─────────────────────────────────────────────────────── */

export interface AttendanceInput {
  employeeName: string;
  workDate: string;
  status: "present" | "late" | "absent" | "remote" | "on_leave";
}

const ATTENDANCE_MIN_SAMPLE = 5;

/**
 * Late/absent patterns. Rules:
 *  - absent ratio >= 15% (n>=5) → warning, confidence 0.75
 *  - late ratio >= 20% (n>=5) → warning, confidence 0.70
 *  - any employee absent >= 3 days → critical (per-employee), confidence 0.85
 *  - zero absences with n>=10 → info/positive, confidence 0.60
 */
export function attendanceSignals(records: AttendanceInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  if (records.length < ATTENDANCE_MIN_SAMPLE) {
    return [
      {
        ...base("attendance", "sample", org),
        title: "Attendance sample too small for trend analysis",
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: [`records = ${records.length} (minimum ${ATTENDANCE_MIN_SAMPLE})`],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Trend rules need a minimum sample before absence or lateness ratios are meaningful.",
        limitations: ["fewer attendance records than the minimum sample"],
        recommendedAction: {
          label: "Keep logging daily attendance",
          detail: "Trends unlock automatically once enough check-ins exist.",
          requiresApproval: false,
          href: "/attendance",
        },
        insufficientData: true,
      },
    ];
  }
  const out: Insight[] = [];
  const absent = records.filter((r) => r.status === "absent");
  const late = records.filter((r) => r.status === "late");
  const absentRatio = absent.length / records.length;
  const lateRatio = late.length / records.length;

  if (absentRatio >= 0.15) {
    out.push({
      ...base("attendance", "absence-spike", org),
      title: `Elevated absence rate (${Math.round(absentRatio * 100)}% of check-ins)`,
      detail: `${absent.length} of ${records.length} attendance records are absences.`,
      severity: "warning",
      confidence: 0.75,
      evidence: [
        `absent = ${absent.length} of ${records.length} records`,
        `absent_ratio = ${absentRatio.toFixed(2)} (threshold 0.15)`,
      ],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Absence rates above 15% usually indicate illness waves, morale issues, or attendance-policy gaps worth a human review.",
      limitations: records.length < 20 ? ["small sample — a few absences move the ratio"] : [],
      recommendedAction: {
        label: "Review absent employees with their managers",
        detail: "Confirm whether absences are explained and coverage is in place.",
        requiresApproval: false,
        href: "/attendance",
      },
      insufficientData: false,
    });
  }
  if (lateRatio >= 0.2) {
    out.push({
      ...base("attendance", "late-cluster", org),
      title: `Late-arrival cluster (${Math.round(lateRatio * 100)}% of check-ins)`,
      detail: `${late.length} of ${records.length} attendance records are late arrivals.`,
      severity: "warning",
      confidence: 0.7,
      evidence: [
        `late = ${late.length} of ${records.length} records`,
        `late_ratio = ${lateRatio.toFixed(2)} (threshold 0.20)`,
      ],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Repeated lateness at this scale points at shift-time, commute, or policy issues rather than individuals.",
      limitations: [],
      recommendedAction: {
        label: "Review shift times and late policy",
        detail: "A structural fix usually beats individual warnings at this ratio.",
        requiresApproval: false,
        href: "/attendance",
      },
      insufficientData: false,
    });
  }
  const absentByEmployee = new Map<string, number>();
  for (const r of absent) absentByEmployee.set(r.employeeName, (absentByEmployee.get(r.employeeName) ?? 0) + 1);
  for (const [name, count] of [...absentByEmployee.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    if (count < 3) continue;
    const scope: InsightScope = { type: "employee", label: name };
    out.push({
      ...base("attendance", "repeated-absence", scope, name),
      title: `${name} absent ${count} times in the observed window`,
      detail: `${count} absence records for ${name}.`,
      severity: "critical",
      confidence: 0.85,
      evidence: [`absences = ${count} (threshold 3)`, `employee = ${name}`],
      scope,
      freshness: fresh(ctx),
      explanation: "Three or more absences in one window is the standard trigger for a welfare check and a coverage plan.",
      limitations: ["reason for absence is not visible to this signal"],
      recommendedAction: {
        label: "Manager welfare check and coverage plan",
        detail: "Confirm the employee is supported and their work is covered.",
        requiresApproval: false,
        href: "/attendance",
      },
      insufficientData: false,
    });
  }
  if (out.length === 0 && absent.length === 0 && records.length >= 10) {
    out.push({
      ...base("attendance", "healthy", org),
      title: "No absences across recent check-ins",
      detail: `${records.length} attendance records with zero absences.`,
      severity: "info",
      confidence: 0.6,
      evidence: [`absent = 0 of ${records.length} records`],
      scope: org,
      freshness: fresh(ctx),
      explanation: "A clean attendance window is worth noting so regressions stand out later.",
      limitations: [],
      recommendedAction: { label: "No action needed", detail: "Attendance is healthy.", requiresApproval: false, href: "/attendance" },
      insufficientData: false,
      tone: "positive",
    });
  }
  return out;
}

/* ── leave ──────────────────────────────────────────────────────────── */

export interface LeaveInput {
  employeeName: string;
  type: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected";
}

/**
 * Leave backlog and coverage. Rules:
 *  - pending >= 10 → critical (0.85); pending >= 5 → warning (0.80)
 *  - >= 3 people on leave the same upcoming day → warning coverage risk (0.70)
 */
export function leaveSignals(requests: LeaveInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  if (requests.length === 0) {
    return [
      {
        ...base("leave", "sample", org),
        title: "No leave requests on record",
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: ["leave_requests = 0"],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Without leave history there is nothing to trend — this is normal for a new workspace.",
        limitations: ["no leave requests recorded"],
        recommendedAction: { label: "No action needed", detail: "Leave analytics appear with the first requests.", requiresApproval: false, href: "/leave" },
        insufficientData: true,
      },
    ];
  }
  const out: Insight[] = [];
  const pending = requests.filter((r) => r.status === "pending");
  if (pending.length >= 5) {
    const oldest = [...pending].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
    out.push({
      ...base("leave", "backlog", org),
      title: `${pending.length} leave requests awaiting decision`,
      detail: `${pending.length} pending requests; oldest starts ${oldest.startDate} (${oldest.employeeName}).`,
      severity: pending.length >= 10 ? "critical" : "warning",
      confidence: pending.length >= 10 ? 0.85 : 0.8,
      evidence: [
        `pending = ${pending.length} (thresholds 5 warn / 10 critical)`,
        `oldest_pending_start = ${oldest.startDate} (${oldest.employeeName})`,
      ],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Stale leave decisions block employee planning and signal an approval bottleneck.",
      limitations: [],
      recommendedAction: {
        label: "Clear the leave approval queue",
        detail: "Decide the oldest requests first to unblock planning.",
        requiresApproval: true,
        href: "/leave",
      },
      insufficientData: false,
    });
  }
  // Coverage: count people out per upcoming day (approved + pending).
  const perDay = new Map<string, Set<string>>();
  for (const r of requests) {
    if (r.status === "rejected") continue;
    const start = Date.parse(r.startDate);
    const end = Date.parse(r.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    for (let d = start; d <= Math.min(end, start + 60 * 86_400_000); d += 86_400_000) {
      const key = new Date(d).toISOString().slice(0, 10);
      if (key < ctx.now.slice(0, 10)) continue;
      const set = perDay.get(key) ?? new Set<string>();
      set.add(r.employeeName);
      perDay.set(key, set);
    }
  }
  let worstDay = "";
  let worstCount = 0;
  for (const [day, set] of perDay) {
    if (set.size > worstCount) {
      worstCount = set.size;
      worstDay = day;
    }
  }
  if (worstCount >= 3) {
    out.push({
      ...base("leave", "coverage-risk", org),
      title: `Coverage risk: ${worstCount} people out on ${worstDay}`,
      detail: `${worstCount} employees have leave covering ${worstDay}.`,
      severity: "warning",
      confidence: 0.7,
      evidence: [`concurrent_out = ${worstCount} on ${worstDay} (threshold 3)`, `names = ${[...(perDay.get(worstDay) ?? [])].slice(0, 6).join(", ")}`],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Same-day overlaps this large can leave teams uncovered unless shifts are rearranged in advance.",
      limitations: ["team membership is not considered — overlaps may span independent teams"],
      recommendedAction: {
        label: "Confirm coverage for the overlap day",
        detail: "Check the affected teams have a plan before approving more overlapping leave.",
        requiresApproval: true,
        href: "/leave",
      },
      insufficientData: false,
    });
  }
  return out;
}

/* ── recruitment ────────────────────────────────────────────────────── */

export interface PipelineInput {
  jobId: string;
  jobTitle: string;
  stage: string;
  stageChangedAt: string;
  candidateName: string;
}

const STALL_DAYS: Record<string, number> = {
  applied: 14,
  screening: 10,
  shortlisted: 10,
  interview: 7,
  offer: 7,
};
const TERMINAL_STAGES = new Set(["hired", "rejected", "withdrawn"]);

/**
 * Pipeline stalls and bottlenecks. Rules:
 *  - any candidate past its stage stall threshold → warning (0.80), grouped by job
 *  - one non-terminal stage holding >= 5 candidates and > 50% of the active pipeline → warning (0.70)
 *  - hires in the last 30 days → info/positive (0.75)
 */
export function recruitmentSignals(pipeline: PipelineInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  if (pipeline.length === 0) {
    return [
      {
        ...base("recruitment", "sample", org),
        title: "No recruitment pipeline data",
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: ["applications = 0"],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Pipeline analytics need at least one application.",
        limitations: ["no applications recorded"],
        recommendedAction: { label: "Post the first job opening", detail: "Pipeline insights appear with the first candidates.", requiresApproval: false, href: "/recruitment" },
        insufficientData: true,
      },
    ];
  }
  const out: Insight[] = [];
  const active = pipeline.filter((p) => !TERMINAL_STAGES.has(p.stage));
  const stalled = active.filter((p) => {
    const threshold = STALL_DAYS[p.stage] ?? 14;
    return daysBetween(p.stageChangedAt, ctx.now) > threshold;
  });
  if (stalled.length > 0) {
    const byJob = new Map<string, { title: string; rows: PipelineInput[] }>();
    for (const s of stalled) {
      const entry = byJob.get(s.jobId) ?? { title: s.jobTitle, rows: [] };
      entry.rows.push(s);
      byJob.set(s.jobId, entry);
    }
    const worst = [...byJob.values()].sort((a, b) => b.rows.length - a.rows.length)[0];
    const scope: InsightScope = { type: "job", label: worst.title, ref: stalled[0].jobId };
    const oldestDays = Math.max(...worst.rows.map((r) => daysBetween(r.stageChangedAt, ctx.now)));
    out.push({
      ...base("recruitment", "stalled-pipeline", scope, stalled[0].jobId),
      title: `Stalled pipeline: ${stalled.length} candidate${stalled.length === 1 ? "" : "s"} past stage SLA${byJob.size > 1 ? ` across ${byJob.size} jobs` : ""}`,
      detail: `Oldest stall is ${oldestDays} days (${worst.rows[0].candidateName}, ${worst.rows[0].stage}, ${worst.title}).`,
      severity: "warning",
      confidence: 0.8,
      evidence: [
        `stalled = ${stalled.length} of ${active.length} active applications`,
        `stage_sla_days = ${JSON.stringify(STALL_DAYS)}`,
        `oldest_stall_days = ${oldestDays}`,
      ],
      scope,
      freshness: fresh(ctx),
      explanation: "Candidates waiting past stage SLAs go cold or accept elsewhere; stalls usually mean an unassigned review or a missing interview slot.",
      limitations: [],
      recommendedAction: {
        label: "Advance or disposition the stalled candidates",
        detail: "Each stalled candidate needs a human decision — interview, hold with a note, or a respectful rejection.",
        requiresApproval: true,
        href: "/recruitment",
      },
      insufficientData: false,
    });
  }
  const byStage = new Map<string, number>();
  for (const p of active) byStage.set(p.stage, (byStage.get(p.stage) ?? 0) + 1);
  for (const [stage, count] of [...byStage.entries()].sort((a, b) => b[1] - a[1])) {
    if (count >= 5 && active.length > 0 && count / active.length > 0.5) {
      out.push({
        ...base("recruitment", "stage-bottleneck", org),
        title: `Bottleneck at "${stage}": ${count} of ${active.length} active candidates`,
        detail: `Over half the active pipeline is sitting in ${stage}.`,
        severity: "warning",
        confidence: 0.7,
        evidence: [`stage = ${stage}`, `stage_count = ${count}`, `active_pipeline = ${active.length}`],
        scope: org,
        freshness: fresh(ctx),
        explanation: "A single swollen stage means the step after it is starved — reviewers, interviewers, or decision capacity.",
        limitations: [],
        recommendedAction: {
          label: "Unblock the bottleneck stage",
          detail: "Add review capacity or run a batch review session for the swollen stage.",
          requiresApproval: true,
          href: "/recruitment",
        },
        insufficientData: false,
      });
      break;
    }
  }
  const recentHires = pipeline.filter(
    (p) => p.stage === "hired" && daysBetween(p.stageChangedAt, ctx.now) <= 30,
  );
  if (recentHires.length > 0) {
    out.push({
      ...base("recruitment", "hiring-momentum", org),
      title: `${recentHires.length} hire${recentHires.length === 1 ? "" : "s"} closed in the last 30 days`,
      detail: recentHires.slice(0, 5).map((h) => `${h.candidateName} → ${h.jobTitle}`).join("; "),
      severity: "info",
      confidence: 0.75,
      evidence: [`hires_30d = ${recentHires.length}`],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Closed hires validate the pipeline is converting, not just accumulating.",
      limitations: [],
      recommendedAction: { label: "No action needed", detail: "Hiring is converting.", requiresApproval: false, href: "/recruitment" },
      insufficientData: false,
      tone: "positive",
    });
  }
  return out;
}

/* ── interviews ─────────────────────────────────────────────────────── */

export interface InterviewInput {
  candidateName: string;
  jobTitle: string;
  scheduledStart: string;
  status: string;
}

/**
 * Interview schedule health (reported under the recruitment category).
 * Rules:
 *  - planned interview with scheduledStart in the past → warning (0.80), capped at 5
 *  - planned interviews in the next 48h → info (0.70) with the count
 */
export function interviewSignals(interviews: InterviewInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  const planned = interviews.filter((i) => i.status === "planned" || i.status === "scheduled");
  const out: Insight[] = [];
  const overdue = planned.filter((i) => {
    const when = Date.parse(i.scheduledStart);
    return Number.isFinite(when) && when < Date.parse(ctx.now);
  });
  for (const i of overdue.slice(0, 5)) {
    const scope: InsightScope = { type: "candidate", label: i.candidateName };
    out.push({
      ...base("recruitment", "overdue-interview", scope, `${i.candidateName}-${i.scheduledStart}`),
      title: `Overdue interview: ${i.candidateName} (${i.jobTitle})`,
      detail: `Scheduled for ${i.scheduledStart} and still marked ${i.status}.`,
      severity: "warning",
      confidence: 0.8,
      evidence: [`scheduled_start = ${i.scheduledStart} (past)`, `status = ${i.status}`, `job = ${i.jobTitle}`],
      scope,
      freshness: fresh(ctx),
      explanation: "Interviews left in a planned state after their slot mean missing feedback or a no-show nobody dispositioned.",
      limitations: [],
      recommendedAction: {
        label: "Disposition the overdue interview",
        detail: "Record feedback or reschedule so the candidate is never left hanging.",
        requiresApproval: false,
        href: "/recruitment",
      },
      insufficientData: false,
    });
  }
  const soonCutoff = Date.parse(ctx.now) + 48 * 3_600_000;
  const upcoming = planned.filter((i) => {
    const when = Date.parse(i.scheduledStart);
    return Number.isFinite(when) && when >= Date.parse(ctx.now) && when <= soonCutoff;
  });
  if (upcoming.length > 0) {
    out.push({
      ...base("recruitment", "upcoming-interviews", org),
      title: `${upcoming.length} interview${upcoming.length === 1 ? "" : "s"} in the next 48 hours`,
      detail: upcoming.slice(0, 5).map((i) => `${i.candidateName} (${i.jobTitle})`).join("; "),
      severity: "info",
      confidence: 0.7,
      evidence: [`upcoming_48h = ${upcoming.length}`],
      scope: org,
      freshness: fresh(ctx),
      explanation: "A short lookahead keeps interviewers prepared and candidates welcomed.",
      limitations: [],
      recommendedAction: { label: "Confirm interviewers are briefed", detail: "Share scorecards before the slots.", requiresApproval: false, href: "/recruitment" },
      insufficientData: false,
    });
  }
  return out;
}

/* ── headcount ──────────────────────────────────────────────────────── */

export interface HeadcountInput {
  department: string;
  employmentStatus: string;
  startDate: string;
}

/**
 * Workforce composition. Rules:
 *  - one department >= 60% of active headcount (n>=10) → warning (0.70)
 *  - >= 30% started within 90 days (n>=10) → info onboarding load (0.65)
 */
export function headcountSignals(employees: HeadcountInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  const active = employees.filter((e) => e.employmentStatus === "active");
  if (active.length === 0) {
    return [
      {
        ...base("headcount", "sample", org),
        title: "No active employees on record",
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: ["active_employees = 0"],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Composition analytics need at least one active employee.",
        limitations: ["no active employees recorded"],
        recommendedAction: { label: "Add the first employee", detail: "Workforce insights appear with headcount data.", requiresApproval: false, href: "/employees" },
        insufficientData: true,
      },
    ];
  }
  const out: Insight[] = [];
  if (active.length >= 10) {
    const byDept = new Map<string, number>();
    for (const e of active) byDept.set(e.department || "Unassigned", (byDept.get(e.department || "Unassigned") ?? 0) + 1);
    const [topDept, topCount] = [...byDept.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCount / active.length >= 0.6) {
      const scope: InsightScope = { type: "department", label: topDept };
      out.push({
        ...base("headcount", "concentration", scope, topDept),
        title: `${topDept} holds ${Math.round((topCount / active.length) * 100)}% of headcount`,
        detail: `${topCount} of ${active.length} active employees are in ${topDept}.`,
        severity: "warning",
        confidence: 0.7,
        evidence: [`department = ${topDept}`, `dept_headcount = ${topCount}`, `active_headcount = ${active.length}`],
        scope,
        freshness: fresh(ctx),
        explanation: "Heavy concentration makes delivery fragile to attrition or leave in one department.",
        limitations: ["roles and seniority mix are not considered"],
        recommendedAction: {
          label: "Review succession coverage in the concentrated department",
          detail: "Confirm critical knowledge is shared before attrition forces it.",
          requiresApproval: false,
          href: "/workforce",
        },
        insufficientData: false,
      });
    }
    const recent = active.filter((e) => {
      const days = daysBetween(e.startDate, ctx.now);
      return days >= 0 && days <= 90;
    });
    if (recent.length / active.length >= 0.3) {
      out.push({
        ...base("headcount", "new-hire-wave", org),
        title: `New-hire wave: ${recent.length} starters in 90 days (${Math.round((recent.length / active.length) * 100)}%)`,
        detail: `${recent.length} of ${active.length} active employees started within the last 90 days.`,
        severity: "info",
        confidence: 0.65,
        evidence: [`starters_90d = ${recent.length}`, `active_headcount = ${active.length}`],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Fast-growing teams need deliberate onboarding throughput or productivity lags hiring.",
        limitations: [],
        recommendedAction: {
          label: "Confirm onboarding throughput",
          detail: "Check onboarding tasks are completing for the recent cohort.",
          requiresApproval: false,
          href: "/workforce",
        },
        insufficientData: false,
      });
    }
  }
  return out;
}

/* ── performance ───────────────────────────────────────────────────── */

export interface GoalInput {
  employeeName: string;
  title: string;
  status: string;
  dueDate: string;
}

/**
 * Goal health. Rules:
 *  - at-risk ratio >= 25% (n>=4) → warning (0.75)
 *  - any overdue non-completed goal → warning (0.80)
 */
export function performanceSignals(goals: GoalInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  if (goals.length === 0) {
    return [
      {
        ...base("performance", "sample", org),
        title: "No goals tracked",
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: ["goals = 0"],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Performance signals need tracked goals or review cycles.",
        limitations: ["no goals recorded"],
        recommendedAction: { label: "Set team goals", detail: "Performance insights appear once goals exist.", requiresApproval: false, href: "/performance" },
        insufficientData: true,
      },
    ];
  }
  const out: Insight[] = [];
  const today = ctx.now.slice(0, 10);
  const overdue = goals.filter((g) => g.status !== "completed" && g.dueDate < today);
  if (overdue.length > 0) {
    out.push({
      ...base("performance", "overdue-goals", org),
      title: `${overdue.length} overdue goal${overdue.length === 1 ? "" : "s"}`,
      detail: `Oldest: "${overdue.slice().sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0].title}" due ${overdue.slice().sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0].dueDate}.`,
      severity: "warning",
      confidence: 0.8,
      evidence: [`overdue = ${overdue.length} of ${goals.length} goals`, `today = ${today}`],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Overdue goals that nobody renegotiates teach the org that commitments are optional.",
      limitations: [],
      recommendedAction: {
        label: "Renegotiate or close overdue goals",
        detail: "Every overdue goal needs a new date, a smaller scope, or an explicit cancellation.",
        requiresApproval: false,
        href: "/performance",
      },
      insufficientData: false,
    });
  }
  if (goals.length >= 4) {
    const atRisk = goals.filter((g) => g.status === "at_risk");
    if (atRisk.length / goals.length >= 0.25) {
      out.push({
        ...base("performance", "at-risk-goals", org),
        title: `${atRisk.length} of ${goals.length} goals at risk`,
        detail: atRisk.slice(0, 5).map((g) => `"${g.title}" (${g.employeeName})`).join("; "),
        severity: "warning",
        confidence: 0.75,
        evidence: [`at_risk = ${atRisk.length}`, `goals = ${goals.length}`, `ratio = ${(atRisk.length / goals.length).toFixed(2)} (threshold 0.25)`],
        scope: org,
        freshness: fresh(ctx),
        explanation: "A quarter or more of goals at risk means the problem is systemic — capacity, dependencies, or unclear ownership.",
        limitations: [],
        recommendedAction: {
          label: "Run an at-risk goal review",
          detail: "Unblock the systemic constraint rather than each goal in isolation.",
          requiresApproval: false,
          href: "/performance",
        },
        insufficientData: false,
      });
    }
  }
  return out;
}

/* ── engagement ────────────────────────────────────────────────────── */

export interface EngagementInput {
  eNPS: number | null;
  responses: number;
  status: string;
}

/**
 * eNPS read. Rules (latest non-draft survey with responses):
 *  - eNPS < 0 → critical (0.80); < 20 → warning (0.70); >= 50 → info/positive (0.70)
 */
export function engagementSignals(surveys: EngagementInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  const scored = surveys.filter((s) => s.status !== "draft" && s.eNPS !== null && s.responses > 0);
  if (scored.length === 0) {
    return [
      {
        ...base("engagement", "sample", org),
        title: "No engagement survey results",
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: ["scored_surveys = 0"],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Engagement signals need at least one closed survey with responses.",
        limitations: ["no survey results recorded"],
        recommendedAction: { label: "Run a pulse survey", detail: "Engagement insights appear after the first results.", requiresApproval: false, href: "/surveys" },
        insufficientData: true,
      },
    ];
  }
  const latest = scored[scored.length - 1];
  const enps = latest.eNPS as number;
  if (enps < 0) {
    return [
      {
        ...base("engagement", "enps-critical", org),
        title: `eNPS ${enps} — detractor territory`,
        detail: `Latest scored survey has eNPS ${enps} across ${latest.responses} responses.`,
        severity: "critical",
        confidence: 0.8,
        evidence: [`enps = ${enps} (threshold < 0)`, `responses = ${latest.responses}`],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Negative eNPS predicts attrition; detractors actively discourage others from joining.",
        limitations: latest.responses < 10 ? ["few responses — treat as directional"] : [],
        recommendedAction: {
          label: "Read every detractor comment this week",
          detail: "Negative eNPS needs qualitative follow-up before the next survey cycle.",
          requiresApproval: false,
          href: "/surveys",
        },
        insufficientData: false,
      },
    ];
  }
  if (enps < 20) {
    return [
      {
        ...base("engagement", "enps-soft", org),
        title: `eNPS ${enps} — below healthy benchmark`,
        detail: `Latest scored survey has eNPS ${enps} across ${latest.responses} responses.`,
        severity: "warning",
        confidence: 0.7,
        evidence: [`enps = ${enps} (threshold < 20)`, `responses = ${latest.responses}`],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Scores under 20 mean passives dominate — the org is one bad quarter from detractor territory.",
        limitations: [],
        recommendedAction: {
          label: "Pick one engagement theme to fix",
          detail: "Survey verbatims usually point at one fixable theme; act on it visibly.",
          requiresApproval: false,
          href: "/surveys",
        },
        insufficientData: false,
      },
    ];
  }
  if (enps >= 50) {
    return [
      {
        ...base("engagement", "enps-strong", org),
        title: `eNPS ${enps} — strong engagement`,
        detail: `Latest scored survey has eNPS ${enps} across ${latest.responses} responses.`,
        severity: "info",
        confidence: 0.7,
        evidence: [`enps = ${enps} (threshold >= 50)`, `responses = ${latest.responses}`],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Scores above 50 mean promoters dominate — protect whatever is working.",
        limitations: [],
        recommendedAction: { label: "No action needed", detail: "Engagement is strong.", requiresApproval: false, href: "/surveys" },
        insufficientData: false,
        tone: "positive",
      },
    ];
  }
  return [];
}

/* ── offboarding ───────────────────────────────────────────────────── */

export interface OffboardingInput {
  employeeName: string;
  exitDate: string;
  status: string;
  tasksDone: number;
  tasksTotal: number;
}

/**
 * Exit pressure. Rules:
 *  - overdue exit (exitDate < today, not completed) → critical (0.85)
 *  - active exits >= 3 → warning (0.75)
 */
export function offboardingSignals(cases: OffboardingInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  if (cases.length === 0) {
    return [
      {
        ...base("offboarding", "sample", org),
        title: "No offboarding cases",
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: ["offboarding_cases = 0"],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Exit analytics appear with the first offboarding case.",
        limitations: ["no offboarding cases recorded"],
        recommendedAction: { label: "No action needed", detail: "No exits in flight.", requiresApproval: false, href: "/offboarding" },
        insufficientData: true,
      },
    ];
  }
  const out: Insight[] = [];
  const today = ctx.now.slice(0, 10);
  const overdue = cases.filter((c) => c.status !== "completed" && c.exitDate < today);
  for (const c of overdue.slice(0, 5)) {
    const scope: InsightScope = { type: "employee", label: c.employeeName };
    out.push({
      ...base("offboarding", "overdue-exit", scope, c.employeeName),
      title: `Overdue exit: ${c.employeeName} (exit date ${c.exitDate})`,
      detail: `Exit date passed with status "${c.status}" and ${c.tasksDone}/${c.tasksTotal} tasks done.`,
      severity: "critical",
      confidence: 0.85,
      evidence: [`exit_date = ${c.exitDate} (today ${today})`, `status = ${c.status}`, `tasks = ${c.tasksDone}/${c.tasksTotal}`],
      scope,
      freshness: fresh(ctx),
      explanation: "Overdue exits risk lingering system access, unreturned assets, and payroll errors.",
      limitations: [],
      recommendedAction: {
        label: "Complete the exit checklist now",
        detail: "Revoke access, recover assets, and close payroll for the overdue exit.",
        requiresApproval: true,
        href: "/offboarding",
      },
      insufficientData: false,
    });
  }
  const active = cases.filter((c) => c.status !== "completed");
  if (active.length >= 3) {
    out.push({
      ...base("offboarding", "exit-wave", org),
      title: `${active.length} exits in flight`,
      detail: active.slice(0, 5).map((c) => `${c.employeeName} (${c.exitDate})`).join("; "),
      severity: "warning",
      confidence: 0.75,
      evidence: [`active_exits = ${active.length} (threshold 3)`],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Multiple simultaneous exits strain handover capacity and often share a root cause worth investigating.",
      limitations: [],
      recommendedAction: {
        label: "Review exit reasons for a pattern",
        detail: "Three or more concurrent exits deserve a retention look, not just checklists.",
        requiresApproval: false,
        href: "/offboarding",
      },
      insufficientData: false,
    });
  }
  return out;
}

/* ── documents ─────────────────────────────────────────────────────── */

export interface DocumentInput {
  name: string;
  kind: string;
  uploadedAt: string;
}

/**
 * Document staleness. Rule: policy-kind documents older than 365 days →
 * info (0.55) — deliberately low confidence since "uploaded" is a weak proxy
 * for "reviewed". Other kinds are not judged.
 */
export function documentSignals(documents: DocumentInput[], ctx: SignalContext): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  if (documents.length === 0) {
    return [
      {
        ...base("documents", "sample", org),
        title: "No documents on record",
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: ["documents = 0"],
        scope: org,
        freshness: fresh(ctx),
        explanation: "Document insights appear with the first uploads.",
        limitations: ["no documents recorded"],
        recommendedAction: { label: "Upload core HR policies", detail: "Handbook and policy docs seed document intelligence.", requiresApproval: false, href: "/documents" },
        insufficientData: true,
      },
    ];
  }
  const stale = documents.filter(
    (d) => d.kind === "policy" && daysBetween(d.uploadedAt, ctx.now) > 365,
  );
  if (stale.length === 0) return [];
  return [
    {
      ...base("documents", "stale-policy", org),
      title: `${stale.length} policy document${stale.length === 1 ? "" : "s"} older than a year`,
      detail: stale.slice(0, 5).map((d) => `"${d.name}" (${d.uploadedAt.slice(0, 10)})`).join("; "),
      severity: "info",
      confidence: 0.55,
      evidence: [`stale_policies = ${stale.length}`, `age_threshold_days = 365`],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Policies drift from practice within a year; a scheduled review keeps the handbook enforceable.",
      limitations: ["upload date is a weak proxy for last review — recently re-acknowledged policies may still flag"],
      recommendedAction: {
        label: "Schedule an annual policy review",
        detail: "Confirm each stale policy still matches practice, then re-issue it.",
        requiresApproval: false,
        href: "/documents",
      },
      insufficientData: false,
    },
  ];
}

/* ── workflows / tasks ─────────────────────────────────────────────── */

export interface TaskInput {
  status: string;
  taskDate: string;
  templateTitle?: string;
}

/**
 * Task health (shared by the workflows + onboarding categories). Rules:
 *  - failed ratio >= 20% (n>=5) → warning (0.75)
 *  - overdue pending (taskDate < today) >= 3 → warning (0.75)
 */
export function taskHealthSignals(
  tasks: TaskInput[],
  category: "workflows" | "onboarding",
  ctx: SignalContext,
  href: string,
): Insight[] {
  const org: InsightScope = { type: "org", label: "Organization" };
  const label = category === "workflows" ? "workflow tasks" : "onboarding tasks";
  if (tasks.length === 0) {
    return [
      {
        ...base(category, "sample", org),
        title: `No ${label} on record`,
        detail: INSUFFICIENT_DATA,
        severity: "info",
        confidence: 0,
        evidence: [`${category}_tasks = 0`],
        scope: org,
        freshness: fresh(ctx),
        explanation: `Task health needs at least one ${label.slice(0, -1)} record.`,
        limitations: [`no ${label} recorded`],
        recommendedAction: { label: "No action needed", detail: `${label[0].toUpperCase()}${label.slice(1)} insights appear with the first runs.`, requiresApproval: false, href },
        insufficientData: true,
      },
    ];
  }
  const out: Insight[] = [];
  if (tasks.length >= 5) {
    const failed = tasks.filter((t) => t.status === "failed");
    if (failed.length / tasks.length >= 0.2) {
      out.push({
        ...base(category, "failure-rate", org),
        title: `${failed.length} of ${tasks.length} ${label} failed`,
        detail: `Failure rate ${Math.round((failed.length / tasks.length) * 100)}% in the observed window.`,
        severity: "warning",
        confidence: 0.75,
        evidence: [`failed = ${failed.length}`, `total = ${tasks.length}`, `ratio = ${(failed.length / tasks.length).toFixed(2)} (threshold 0.20)`],
        scope: org,
        freshness: fresh(ctx),
        explanation: "One-in-five task failures points at a broken step (permissions, integrations, bad template) rather than bad luck.",
        limitations: [],
        recommendedAction: {
          label: "Inspect the failing workflow steps",
          detail: "Find the common failing step and fix the template or its permissions.",
          requiresApproval: false,
          href,
        },
        insufficientData: false,
      });
    }
  }
  const today = ctx.now.slice(0, 10);
  const overdue = tasks.filter((t) => (t.status === "pending" || t.status === "in_progress") && t.taskDate < today);
  if (overdue.length >= 3) {
    out.push({
      ...base(category, "overdue", org),
      title: `${overdue.length} overdue ${label}`,
      detail: `${overdue.length} tasks past their date are still open.`,
      severity: "warning",
      confidence: 0.75,
      evidence: [`overdue_open = ${overdue.length} (threshold 3)`, `today = ${today}`],
      scope: org,
      freshness: fresh(ctx),
      explanation: "Overdue open tasks accumulate silently; a weekly sweep keeps queues honest.",
      limitations: [],
      recommendedAction: {
        label: "Sweep overdue tasks",
        detail: "Complete, reassign, or cancel each overdue task.",
        requiresApproval: false,
        href,
      },
      insufficientData: false,
    });
  }
  return out;
}

/* ── expenses (adapter over the existing anomaly detector) ─────────── */

export interface ExpenseAnomalyInput {
  id: string;
  employeeName: string;
  merchant: string;
  amount: number;
  category: string;
  severity: "high" | "medium";
  reason: string;
}

/**
 * Wraps `detectExpenseAnomalies` output in the insight envelope.
 * high → critical (0.85), medium → warning (0.70). Empty input yields no
 * insights (the detector's own sample handling applies).
 */
export function expenseAnomalySignals(anomalies: ExpenseAnomalyInput[], ctx: SignalContext): Insight[] {
  return anomalies.slice(0, 10).map((a) => {
    const scope: InsightScope = { type: "employee", label: a.employeeName };
    const critical = a.severity === "high";
    return {
      ...base("expenses", critical ? "policy-breach" : "spend-outlier", scope, a.id),
      title: `${a.merchant} — ${a.amount.toLocaleString()} (${a.category})`,
      detail: a.reason,
      severity: critical ? ("critical" as const) : ("warning" as const),
      confidence: critical ? 0.85 : 0.7,
      evidence: [`employee = ${a.employeeName}`, `merchant = ${a.merchant}`, `amount = ${a.amount}`, `category = ${a.category}`, `rule = ${a.reason}`],
      scope,
      freshness: fresh(ctx),
      explanation: critical
        ? "High-severity flags (policy denylist or extreme outliers) should block approval until a human clears them."
        : "Medium-severity flags (duplicates or moderate outliers) deserve a second look before approval.",
      limitations: [],
      recommendedAction: {
        label: critical ? "Hold approval pending review" : "Double-check before approving",
        detail: "Confirm the claim is legitimate and in policy, then approve or reject.",
        requiresApproval: true,
        href: "/expenses",
      },
      insufficientData: false,
    };
  });
}
