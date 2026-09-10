/**
 * Recruitment intelligence routes — authorization + contract.
 *
 * Mocks stand in for session resolution (@/lib/rbac), data loading
 * (@/lib/api, @/lib/recruitment/loader) and the external semantic bridge;
 * all gating, filtering, projection and validation logic is production code.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import type { RbacContext } from "@/lib/rbac";

const getRbacContext = jest.fn<Promise<RbacContext>, []>();
jest.mock("@/lib/rbac", () => ({
  getRbacContext: () => getRbacContext(),
  rbacErrorResponse: () => null,
}));

const getCandidates = jest.fn();
jest.mock("@/lib/api", () => ({ getCandidates: () => getCandidates() }));

const loadCandidateProfile = jest.fn();
const loadJobProfile = jest.fn();
jest.mock("@/lib/recruitment/loader", () => ({
  loadCandidateProfile: (...a: unknown[]) => (loadCandidateProfile as (...args: unknown[]) => unknown)(...a),
  loadJobProfile: (...a: unknown[]) => (loadJobProfile as (...args: unknown[]) => unknown)(...a),
}));

const findSemanticCandidates = jest.fn();
jest.mock("@/src/services/semanticSearchService", () => ({
  findSemanticCandidates: (...a: unknown[]) => (findSemanticCandidates as (...args: unknown[]) => unknown)(...a),
}));

import { GET as searchCandidates } from "@/app/api/candidates/route";
import { POST as matchRoute } from "@/app/api/recruitment/match/route";
import { POST as matchCandidateRoute } from "@/app/api/ai/match-candidate/route";
import { POST as semanticSearchRoute } from "@/app/api/ai/semantic-search/route";

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

const CANDIDATES = [
  { id: "c1", firstName: "Lena", lastName: "Kowalski", email: "lena@example.com", role: "Backend Engineer", jobPostingId: "j1", stage: "screening", matchScore: 86, source: "Referral", resumeUrl: "https://x/r.pdf", tags: ["python", "react"], location: "Karachi, PK" },
  { id: "c2", firstName: "Theo", lastName: "Dubois", email: "theo@example.com", role: "Backend Engineer", jobPostingId: "j1", stage: "applied", matchScore: 70, source: "LinkedIn", resumeUrl: null, tags: ["java"], location: "Lahore, PK" },
  { id: "c3", firstName: "Amara", lastName: "Okafor", email: "amara@example.com", role: "Designer", jobPostingId: "j2", stage: "interview", matchScore: 91, source: "Careers page", resumeUrl: null, tags: ["figma"], location: "Remote" },
];

beforeEach(() => {
  jest.clearAllMocks();
  getCandidates.mockResolvedValue(CANDIDATES);
});

describe("GET /api/candidates", () => {
  it("serves HR_ADMIN with a PII-minimized projection", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    const res = await searchCandidates(new Request("http://localhost/api/candidates"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Array<Record<string, unknown>>; count: number };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(3);
    for (const row of body.data) {
      expect(row).not.toHaveProperty("email");
      expect(row).not.toHaveProperty("phone");
      expect(row).not.toHaveProperty("resumeUrl");
      expect(row).toHaveProperty("tags");
      expect(row).toHaveProperty("location");
    }
  });
  it("filters by stage + multi-token query and enforces the limit", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    const res = await searchCandidates(new Request("http://localhost/api/candidates?stage=screening&query=lena+python&limit=1"));
    const body = (await res.json()) as { ok: boolean; data: Array<{ id: string }>; total: number };
    expect(body.data.map((r) => r.id)).toEqual(["c1"]);
    expect(body.total).toBe(1);
  });
  it("rejects unknown stages and over-limit requests", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    expect((await searchCandidates(new Request("http://localhost/api/candidates?stage=nope"))).status).toBe(400);
    expect((await searchCandidates(new Request("http://localhost/api/candidates?limit=500"))).status).toBe(400);
  });
  it("denies MANAGER/EMPLOYEE deny-first (no data load)", async () => {
    for (const ctx of [managerCtx, employeeCtx]) {
      getRbacContext.mockResolvedValue(ctx);
      expect((await searchCandidates(new Request("http://localhost/api/candidates"))).status).toBe(403);
    }
    expect(getCandidates).not.toHaveBeenCalled();
  });
});

describe("POST /api/recruitment/match", () => {
  const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
  const JOB_ID = "22222222-2222-4222-8222-222222222222";
  beforeEach(() => {
    loadCandidateProfile.mockResolvedValue({ skills: ["Python"], experienceYears: 4, location: "Karachi, PK", summary: null, tags: [] });
    loadJobProfile.mockResolvedValue({ title: "Backend", description: "", requirements: ["Python"], skills: ["Python"], location: "Karachi, PK", employmentType: "full_time", minExperienceYears: 3 });
  });
  it("returns the advisory match envelope for HR_ADMIN", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    const res = await matchRoute(
      new Request("http://localhost/api/recruitment/match", {
        method: "POST",
        body: JSON.stringify({ candidateId: CANDIDATE_ID, jobOpeningId: JOB_ID }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; advisory: boolean; disclaimer: string; match: { score: number; recommendation: string } };
    expect(body.ok).toBe(true);
    expect(body.advisory).toBe(true);
    expect(body.disclaimer).toMatch(/human review/i);
    expect(body.match.score).toBeGreaterThan(50);
  });
  it("validates UUIDs and denies under-privileged roles", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    expect(
      (await matchRoute(new Request("http://localhost/api/recruitment/match", { method: "POST", body: JSON.stringify({ candidateId: "x" }) }))).status,
    ).toBe(400);
    getRbacContext.mockResolvedValue(employeeCtx);
    expect(
      (await matchRoute(new Request("http://localhost/api/recruitment/match", { method: "POST", body: JSON.stringify({ candidateId: CANDIDATE_ID, jobOpeningId: JOB_ID }) }))).status,
    ).toBe(403);
  });
  it("answers 404/503 honestly when data is unavailable", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    loadCandidateProfile.mockResolvedValue(null);
    loadJobProfile.mockResolvedValue(null);
    const res = await matchRoute(
      new Request("http://localhost/api/recruitment/match", { method: "POST", body: JSON.stringify({ candidateId: CANDIDATE_ID, jobOpeningId: JOB_ID }) }),
    );
    expect([404, 503]).toContain(res.status);
  });
});

describe("hardened dormant routes", () => {
  it("match-candidate denies EMPLOYEE and serves HR_ADMIN via the bridge service", async () => {
    getRbacContext.mockResolvedValue(employeeCtx);
    expect(
      (await matchCandidateRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ jobContext: "python backend role" }) }))).status,
    ).toBe(403);
    expect(findSemanticCandidates).not.toHaveBeenCalled();
    getRbacContext.mockResolvedValue(adminCtx);
    findSemanticCandidates.mockResolvedValue({ matches: [] });
    const res = await matchCandidateRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ jobContext: "python backend role" }) }));
    expect(res.status).toBe(200);
    expect(findSemanticCandidates).toHaveBeenCalledWith("python backend role", 5);
  });
  it("semantic-search denies MANAGER and validates input for HR_ADMIN", async () => {
    getRbacContext.mockResolvedValue(managerCtx);
    expect(
      (await semanticSearchRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ query: "python backend" }) }))).status,
    ).toBe(403);
    getRbacContext.mockResolvedValue(adminCtx);
    expect(
      (await semanticSearchRoute(new Request("http://x", { method: "POST", body: JSON.stringify({ query: "ab" }) }))).status,
    ).toBe(400);
  });
});
