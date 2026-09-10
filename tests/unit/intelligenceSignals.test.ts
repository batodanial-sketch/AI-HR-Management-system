/**
 * Intelligence signals — deterministic rule verification.
 *
 * Every signal family: threshold behavior, severity + confidence, evidence
 * presence, and the INSUFFICIENT_DATA path. Envelope invariants hold for
 * every emitted insight.
 */
import { INSUFFICIENT_DATA, sortInsights, type Insight } from "@/lib/intelligence/types";
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
} from "@/lib/intelligence/signals";
import { composeBriefing } from "@/lib/intelligence/briefing";
import { deriveAlerts } from "@/lib/intelligence/alerts";

const CTX: SignalContext = { now: "2026-09-10T12:00:00.000Z", source: "unit-test" };

function expectEnvelope(list: Insight[]): void {
  for (const i of list) {
    expect(i.id).toMatch(/^[a-z]+:[a-z-]+(:.+)?$/);
    expect(i.title.length).toBeGreaterThan(0);
    expect(i.detail.length).toBeGreaterThan(0);
    expect(["info", "warning", "critical"]).toContain(i.severity);
    expect(i.confidence).toBeGreaterThanOrEqual(0);
    expect(i.confidence).toBeLessThanOrEqual(1);
    expect(i.evidence.length).toBeGreaterThan(0);
    expect(i.explanation.length).toBeGreaterThan(0);
    expect(i.recommendedAction.label.length).toBeGreaterThan(0);
    expect(typeof i.recommendedAction.requiresApproval).toBe("boolean");
    expect(typeof i.insufficientData).toBe("boolean");
    if (i.insufficientData) expect(i.detail).toBe(INSUFFICIENT_DATA);
  }
}

describe("attendance signals", () => {
  it("emits INSUFFICIENT_DATA below the minimum sample", () => {
    const out = attendanceSignals(
      [{ employeeName: "A", workDate: "2026-09-09", status: "present" }],
      CTX,
    );
    expect(out).toHaveLength(1);
    expect(out[0].insufficientData).toBe(true);
    expectEnvelope(out);
  });
  it("flags absence spikes and per-employee repeated absence", () => {
    const rows = [
      { employeeName: "A", workDate: "2026-09-01", status: "absent" as const },
      { employeeName: "A", workDate: "2026-09-02", status: "absent" as const },
      { employeeName: "A", workDate: "2026-09-03", status: "absent" as const },
      { employeeName: "B", workDate: "2026-09-01", status: "present" as const },
      { employeeName: "C", workDate: "2026-09-01", status: "present" as const },
      { employeeName: "D", workDate: "2026-09-01", status: "present" as const },
    ];
    const out = attendanceSignals(rows, CTX);
    expect(out.some((i) => i.id === "attendance:absence-spike" && i.severity === "warning")).toBe(true);
    const repeated = out.find((i) => i.id.startsWith("attendance:repeated-absence"));
    expect(repeated?.severity).toBe("critical");
    expect(repeated?.confidence).toBe(0.85);
    expectEnvelope(out);
  });
  it("reports a healthy window as a positive info insight", () => {
    const rows = Array.from({ length: 12 }, (_, k) => ({
      employeeName: `E${k}`,
      workDate: "2026-09-09",
      status: "present" as const,
    }));
    const out = attendanceSignals(rows, CTX);
    expect(out).toHaveLength(1);
    expect(out[0].tone).toBe("positive");
    expectEnvelope(out);
  });
});

describe("leave signals", () => {
  it("emits INSUFFICIENT_DATA with no requests", () => {
    const out = leaveSignals([], CTX);
    expect(out[0].insufficientData).toBe(true);
    expectEnvelope(out);
  });
  it("escalates backlog from warning to critical", () => {
    const pending = (n: number) =>
      Array.from({ length: n }, (_, k) => ({
        employeeName: `E${k}`,
        type: "pto",
        startDate: "2026-10-01",
        endDate: "2026-10-02",
        status: "pending" as const,
      }));
    expect(leaveSignals(pending(5), CTX).some((i) => i.id === "leave:backlog" && i.severity === "warning")).toBe(true);
    const critical = leaveSignals(pending(11), CTX);
    expect(critical.some((i) => i.id === "leave:backlog" && i.severity === "critical")).toBe(true);
    expect(critical.find((i) => i.id === "leave:backlog")?.recommendedAction.requiresApproval).toBe(true);
  });
  it("detects same-day coverage risk", () => {
    const rows = ["A", "B", "C"].map((n) => ({
      employeeName: n,
      type: "pto",
      startDate: "2026-09-20",
      endDate: "2026-09-20",
      status: "approved" as const,
    }));
    const out = leaveSignals(rows, CTX);
    const coverage = out.find((i) => i.id === "leave:coverage-risk");
    expect(coverage?.severity).toBe("warning");
    expect(coverage?.evidence.join(" ")).toContain("2026-09-20");
    expectEnvelope(out);
  });
});

describe("recruitment signals", () => {
  it("emits INSUFFICIENT_DATA with an empty pipeline", () => {
    const out = recruitmentSignals([], CTX);
    expect(out[0].insufficientData).toBe(true);
    expectEnvelope(out);
  });
  it("flags stalled candidates past stage SLA", () => {
    const out = recruitmentSignals(
      [
        { jobId: "j1", jobTitle: "Backend Engineer", stage: "screening", stageChangedAt: "2026-08-01T00:00:00Z", candidateName: "Lena K" },
        { jobId: "j1", jobTitle: "Backend Engineer", stage: "applied", stageChangedAt: "2026-09-09T00:00:00Z", candidateName: "Theo D" },
      ],
      CTX,
    );
    const stalled = out.find((i) => i.id === "recruitment:stalled-pipeline:j1");
    expect(stalled?.severity).toBe("warning");
    expect(stalled?.scope).toMatchObject({ type: "job", label: "Backend Engineer" });
    expect(stalled?.recommendedAction.requiresApproval).toBe(true);
    expectEnvelope(out);
  });
  it("flags a swollen stage bottleneck and celebrates hires", () => {
    const rows = Array.from({ length: 6 }, (_, k) => ({
      jobId: "j1",
      jobTitle: "Backend Engineer",
      stage: "screening",
      stageChangedAt: "2026-09-09T00:00:00Z",
      candidateName: `C${k}`,
    }));
    rows.push({ jobId: "j1", jobTitle: "Backend Engineer", stage: "hired", stageChangedAt: "2026-09-05T00:00:00Z", candidateName: "Amara O" });
    const out = recruitmentSignals(rows, CTX);
    expect(out.some((i) => i.id === "recruitment:stage-bottleneck")).toBe(true);
    const momentum = out.find((i) => i.id === "recruitment:hiring-momentum");
    expect(momentum?.tone).toBe("positive");
    expectEnvelope(out);
  });
});

describe("interview signals", () => {
  it("flags overdue interviews and previews upcoming ones", () => {
    const out = interviewSignals(
      [
        { candidateName: "Lena K", jobTitle: "Backend", scheduledStart: "2026-09-01T10:00:00Z", status: "planned" },
        { candidateName: "Theo D", jobTitle: "Backend", scheduledStart: "2026-09-11T10:00:00Z", status: "planned" },
        { candidateName: "Done", jobTitle: "Backend", scheduledStart: "2026-09-01T10:00:00Z", status: "completed" },
      ],
      CTX,
    );
    expect(out.some((i) => i.id.startsWith("recruitment:overdue-interview") && i.severity === "warning")).toBe(true);
    expect(out.some((i) => i.id === "recruitment:upcoming-interviews")).toBe(true);
    expectEnvelope(out);
  });
});

describe("headcount / performance / engagement / offboarding / documents / tasks", () => {
  it("headcount: concentration + new-hire wave + insufficient path", () => {
    expect(headcountSignals([], CTX)[0].insufficientData).toBe(true);
    const rows = Array.from({ length: 12 }, (_, k) => ({
      department: k < 9 ? "Engineering" : "Design",
      employmentStatus: "active",
      startDate: k < 5 ? "2026-08-15" : "2023-01-01",
    }));
    const out = headcountSignals(rows, CTX);
    expect(out.some((i) => i.id.startsWith("headcount:concentration"))).toBe(true);
    expect(out.some((i) => i.id === "headcount:new-hire-wave")).toBe(true);
    expectEnvelope(out);
  });
  it("performance: overdue + at-risk goals", () => {
    expect(performanceSignals([], CTX)[0].insufficientData).toBe(true);
    const out = performanceSignals(
      [
        { employeeName: "A", title: "Ship v2", status: "in_progress", dueDate: "2026-01-01" },
        { employeeName: "B", title: "Cut costs", status: "at_risk", dueDate: "2026-12-01" },
        { employeeName: "C", title: "Hire 2", status: "at_risk", dueDate: "2026-12-01" },
        { employeeName: "D", title: "Docs", status: "completed", dueDate: "2026-01-01" },
      ],
      CTX,
    );
    expect(out.some((i) => i.id === "performance:overdue-goals")).toBe(true);
    expect(out.some((i) => i.id === "performance:at-risk-goals")).toBe(true);
    expectEnvelope(out);
  });
  it("engagement: critical / warning / strong / silent bands", () => {
    expect(engagementSignals([], CTX)[0].insufficientData).toBe(true);
    expect(engagementSignals([{ eNPS: -5, responses: 40, status: "closed" }], CTX)[0].severity).toBe("critical");
    expect(engagementSignals([{ eNPS: 10, responses: 40, status: "closed" }], CTX)[0].severity).toBe("warning");
    const strong = engagementSignals([{ eNPS: 62, responses: 40, status: "closed" }], CTX);
    expect(strong[0].tone).toBe("positive");
    expect(engagementSignals([{ eNPS: 35, responses: 40, status: "closed" }], CTX)).toHaveLength(0);
    expectEnvelope(strong);
  });
  it("offboarding: overdue exit is critical; three active exits warn", () => {
    expect(offboardingSignals([], CTX)[0].insufficientData).toBe(true);
    const out = offboardingSignals(
      [
        { employeeName: "X", exitDate: "2026-09-01", status: "in_progress", tasksDone: 2, tasksTotal: 9 },
        { employeeName: "Y", exitDate: "2026-10-01", status: "planned", tasksDone: 0, tasksTotal: 9 },
        { employeeName: "Z", exitDate: "2026-10-05", status: "planned", tasksDone: 0, tasksTotal: 9 },
      ],
      CTX,
    );
    expect(out.some((i) => i.id.startsWith("offboarding:overdue-exit") && i.severity === "critical")).toBe(true);
    expect(out.some((i) => i.id === "offboarding:exit-wave")).toBe(true);
    expectEnvelope(out);
  });
  it("documents: stale policies flagged with low confidence + limitation", () => {
    expect(documentSignals([], CTX)[0].insufficientData).toBe(true);
    const out = documentSignals(
      [{ name: "Handbook.pdf", kind: "policy", uploadedAt: "2024-01-01T00:00:00Z" }],
      CTX,
    );
    expect(out[0].confidence).toBeLessThan(0.6);
    expect(out[0].limitations.length).toBeGreaterThan(0);
    expectEnvelope(out);
  });
  it("tasks: failure rate + overdue sweep for both categories", () => {
    for (const category of ["workflows", "onboarding"] as const) {
      expect(taskHealthSignals([], category, CTX, "/x")[0].insufficientData).toBe(true);
      const out = taskHealthSignals(
        [
          { status: "failed", taskDate: "2026-09-09" },
          { status: "failed", taskDate: "2026-09-09" },
          { status: "completed", taskDate: "2026-09-09" },
          { status: "pending", taskDate: "2026-09-01" },
          { status: "pending", taskDate: "2026-09-01" },
          { status: "pending", taskDate: "2026-09-01" },
        ],
        category,
        CTX,
        "/x",
      );
      expect(out.some((i) => i.id === `${category}:failure-rate`)).toBe(true);
      expect(out.some((i) => i.id === `${category}:overdue`)).toBe(true);
      expectEnvelope(out);
    }
  });
  it("expense adapter maps severity deterministically", () => {
    const out = expenseAnomalySignals(
      [{ id: "a1", employeeName: "A", merchant: "Casino", amount: 500, category: "Travel", severity: "high", reason: "Out of policy." }],
      CTX,
    );
    expect(out[0].severity).toBe("critical");
    expect(out[0].recommendedAction.requiresApproval).toBe(true);
    expectEnvelope(out);
  });
});

describe("briefing + alerts + sorting", () => {
  const attention: Insight = {
    id: "leave:backlog", category: "leave", title: "t", detail: "d", severity: "warning",
    confidence: 0.8, evidence: ["e"], scope: { type: "org", label: "Org" },
    freshness: { asOf: CTX.now, source: "s" }, explanation: "why", limitations: [],
    recommendedAction: { label: "Act", detail: "Impact.", requiresApproval: true }, insufficientData: false,
  };
  const positive: Insight = { ...attention, id: "attendance:healthy", category: "attendance", severity: "info", tone: "positive" as const };
  const thin: Insight = { ...attention, id: "leave:sample", detail: INSUFFICIENT_DATA, severity: "info", insufficientData: true };

  it("briefing splits attention / positive / recommended / insufficient", () => {
    const b = composeBriefing([attention, positive, thin], CTX.now);
    expect(b.attention.map((i) => i.id)).toEqual(["leave:backlog"]);
    expect(b.positive.map((i) => i.id)).toEqual(["attendance:healthy"]);
    expect(b.recommended).toHaveLength(1);
    expect(b.recommended[0]).toMatchObject({ action: "Act", why: "why", expectedImpact: "Impact.", requiresApproval: true });
    expect(b.insufficient).toEqual(["leave"]);
    expect(b.counts).toEqual({ attention: 1, positive: 1, recommended: 1, insufficient: 1 });
  });
  it("alerts derive only from sufficient warning/critical insights with stable ids", () => {
    const alerts = deriveAlerts([attention, positive, thin], CTX.now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "leave:backlog", severity: "warning", status: "open" });
  });
  it("sortInsights orders critical first, then confidence", () => {
    const lo = { ...attention, id: "a", severity: "critical" as const, confidence: 0.5 };
    const hi = { ...attention, id: "b", severity: "warning" as const, confidence: 0.99 };
    expect(sortInsights([hi, lo]).map((i) => i.id)).toEqual(["a", "b"]);
  });
});
