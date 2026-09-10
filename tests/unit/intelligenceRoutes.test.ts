/**
 * Intelligence API surface — deny-first HR_ADMIN+ gating + payload shape.
 *
 * The RBAC mock stands in for session resolution only; the role comparison
 * (`roleAtLeast`) and the route wiring are production code. The aggregator is
 * stubbed so these tests prove authorization, not data loading.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import type { RbacContext } from "@/lib/rbac";

const getRbacContext = jest.fn<Promise<RbacContext>, []>();
jest.mock("@/lib/rbac", () => ({
  getRbacContext: () => getRbacContext(),
  rbacErrorResponse: () => null,
}));

const getInsightSet = jest.fn();
jest.mock("@/lib/intelligence/aggregator", () => ({ getInsightSet: () => getInsightSet() }));

import { GET as getInsights } from "@/app/api/intelligence/insights/route";
import { GET as getBriefing } from "@/app/api/intelligence/briefing/route";
import { GET as getAlerts } from "@/app/api/intelligence/alerts/route";

const baseCtx = {
  user: { id: "u1", email: "a@x.test", fullName: "A", organizationId: "org-1", role: "admin" as const },
  organizationId: "org-1",
  scope: "org" as const,
  employeeId: null,
  reportIds: [],
  demoMode: false,
  roleCode: "admin" as const,
  membershipId: "m1",
};

const adminCtx: RbacContext = { ...baseCtx, role: "HR_ADMIN" };
const managerCtx: RbacContext = { ...baseCtx, role: "MANAGER", scope: "team" as const };
const employeeCtx: RbacContext = { ...baseCtx, role: "EMPLOYEE", scope: "self" as const };

const INSIGHT = {
  id: "leave:backlog",
  category: "leave",
  title: "t",
  detail: "d",
  severity: "warning",
  confidence: 0.8,
  evidence: ["e"],
  scope: { type: "org", label: "Org" },
  freshness: { asOf: "2026-09-10T00:00:00Z", source: "s" },
  explanation: "why",
  limitations: [],
  recommendedAction: { label: "Act", detail: "Impact.", requiresApproval: true },
  insufficientData: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  getInsightSet.mockResolvedValue({ insights: [INSIGHT], sources: [], generatedAt: "2026-09-10T00:00:00Z" });
});

describe("GET /api/intelligence/insights", () => {
  it("serves HR_ADMIN with the full envelope", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    const res = await getInsights();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; insights: unknown[]; count: number };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);
    expect(body.insights).toHaveLength(1);
  });
  it("denies MANAGER and EMPLOYEE with 403 (deny-first, no data load)", async () => {
    for (const ctx of [managerCtx, employeeCtx]) {
      getRbacContext.mockResolvedValue(ctx);
      const res = await getInsights();
      expect(res.status).toBe(403);
    }
    expect(getInsightSet).not.toHaveBeenCalled();
  });
});

describe("GET /api/intelligence/briefing", () => {
  it("serves HR_ADMIN with a composed briefing", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    const res = await getBriefing();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; briefing: { attention: unknown[]; recommended: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.briefing.attention).toHaveLength(1);
    expect(body.briefing.recommended).toHaveLength(1);
  });
  it("denies EMPLOYEE with 403", async () => {
    getRbacContext.mockResolvedValue(employeeCtx);
    expect((await getBriefing()).status).toBe(403);
  });
});

describe("GET /api/intelligence/alerts", () => {
  it("serves HR_ADMIN with derived alerts", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    const res = await getAlerts();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; alerts: Array<{ id: string; status: string }> };
    expect(body.ok).toBe(true);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]).toMatchObject({ id: "leave:backlog", status: "open" });
  });
  it("denies MANAGER with 403", async () => {
    getRbacContext.mockResolvedValue(managerCtx);
    expect((await getAlerts()).status).toBe(403);
  });
});
