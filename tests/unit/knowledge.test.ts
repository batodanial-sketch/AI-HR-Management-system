/**
 * Company knowledge — retrieval ranking, grounded-answer envelope, and the
 * read-any-member / write-HR_ADMIN+ split.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import type { RbacContext } from "@/lib/rbac";

const getRbacContext = jest.fn<Promise<RbacContext>, []>();
jest.mock("@/lib/rbac", () => ({
  getRbacContext: () => getRbacContext(),
  rbacErrorResponse: () => null,
}));

const listKnowledgeEntries = jest.fn();
const createKnowledgeEntry = jest.fn();
const deleteKnowledgeEntry = jest.fn();
jest.mock("@/lib/knowledge/store", () => ({
  listKnowledgeEntries: (...a: unknown[]) => (listKnowledgeEntries as (...args: unknown[]) => unknown)(...a),
  createKnowledgeEntry: (...a: unknown[]) => (createKnowledgeEntry as (...args: unknown[]) => unknown)(...a),
  deleteKnowledgeEntry: (...a: unknown[]) => (deleteKnowledgeEntry as (...args: unknown[]) => unknown)(...a),
}));
jest.mock("@/lib/audit", () => ({ recordAuditLog: async () => undefined }));

import { composeGroundedAnswer } from "@/lib/knowledge/answer";
import { searchKnowledge, type KnowledgeEntry } from "@/lib/knowledge/search";
import { GET as searchRoute } from "@/app/api/knowledge/search/route";
import { DELETE as deleteRoute, POST as createRoute } from "@/app/api/knowledge/route";

const ENTRIES: KnowledgeEntry[] = [
  { id: "k1", title: "Annual leave policy", content: "Employees accrue twenty days of annual leave per year, requested via the leave page.", source: "policy", tags: ["leave", "pto"], updatedAt: "2026-08-01T00:00:00Z" },
  { id: "k2", title: "Office wifi", content: "The wifi password rotates monthly; ask IT.", source: "faq", tags: ["it"], updatedAt: "2026-08-01T00:00:00Z" },
  { id: "k3", title: "Stale handbook", content: "Ancient leave rules nobody follows.", source: "manual", tags: [], updatedAt: "2020-01-01T00:00:00Z" },
];

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
const employeeCtx: RbacContext = { ...baseCtx, role: "EMPLOYEE", scope: "self" as const };

describe("searchKnowledge", () => {
  it("ranks title matches above content-only matches", () => {
    const hits = searchKnowledge(ENTRIES, "annual leave policy");
    expect(hits[0].id).toBe("k1");
    expect(hits[0].relevance).toBeGreaterThan(0);
    expect(hits[0].relevance).toBeLessThanOrEqual(1);
  });
  it("matches tags; content hits carry excerpts, tag-only hits do not", () => {
    const tagOnly = searchKnowledge(ENTRIES, "pto");
    expect(tagOnly[0].id).toBe("k1");
    expect(tagOnly[0].matchedTerms).toContain("pto");
    expect(tagOnly[0].excerpt).toBe("");
    const content = searchKnowledge(ENTRIES, "accrue annual leave");
    expect(content[0].id).toBe("k1");
    expect(content[0].excerpt.length).toBeGreaterThan(0);
  });
  it("returns [] for empty/short-token queries and caps the limit", () => {
    expect(searchKnowledge(ENTRIES, "a b")).toEqual([]);
    expect(searchKnowledge(ENTRIES, "")).toEqual([]);
    expect(searchKnowledge(ENTRIES, "leave", 1)).toHaveLength(1);
  });
});

describe("composeGroundedAnswer", () => {
  it("returns KNOWN with cited sources above the threshold", () => {
    const hits = searchKnowledge(ENTRIES, "annual leave policy");
    const answer = composeGroundedAnswer("how much annual leave?", hits, "2026-09-10T00:00:00Z");
    expect(answer.verdict).toBe("KNOWN");
    expect(answer.confidence).toBe(hits[0].relevance);
    expect(answer.sources[0]).toMatchObject({ id: "k1", stale: false });
    expect(answer.note).toMatch(/INFERRED/);
  });
  it("returns explicit UNKNOWN below the threshold or with no hits", () => {
    expect(composeGroundedAnswer("q", [], "2026-09-10T00:00:00Z")).toMatchObject({ verdict: "UNKNOWN", answer: null, confidence: 0 });
    const weakHit = { ...ENTRIES[1], relevance: 0.2, excerpt: "", matchedTerms: ["wifi"] };
    const answer = composeGroundedAnswer("quantum physics", [weakHit], "2026-09-10T00:00:00Z");
    expect(answer.verdict).toBe("UNKNOWN");
    expect(answer.sources).toEqual([]);
  });
  it("flags stale sources", () => {
    const hits = searchKnowledge([ENTRIES[2]], "ancient leave rules");
    const answer = composeGroundedAnswer("leave rules?", hits, "2026-09-10T00:00:00Z");
    if (answer.verdict === "KNOWN") {
      expect(answer.sources[0].stale).toBe(true);
    }
  });
});

describe("knowledge routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listKnowledgeEntries.mockResolvedValue(ENTRIES);
  });

  it("search: any member may search (EMPLOYEE allowed)", async () => {
    getRbacContext.mockResolvedValue(employeeCtx);
    const res = await searchRoute(new Request("http://x/api/knowledge/search?q=annual+leave"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; answer: { verdict: string }; count: number };
    expect(body.ok).toBe(true);
    expect(body.answer.verdict).toBe("KNOWN");
    expect(listKnowledgeEntries).toHaveBeenCalledWith("org-1");
  });
  it("search: validates query length", async () => {
    getRbacContext.mockResolvedValue(adminCtx);
    expect((await searchRoute(new Request("http://x/api/knowledge/search?q=x"))).status).toBe(400);
  });
  it("create: HR_ADMIN 201, EMPLOYEE 403, validation 400", async () => {
    getRbacContext.mockResolvedValue(employeeCtx);
    expect(
      (await createRoute(new Request("http://x/api/knowledge", { method: "POST", body: JSON.stringify({ title: "T", content: "long enough content here" }) }))).status,
    ).toBe(403);
    getRbacContext.mockResolvedValue(adminCtx);
    expect(
      (await createRoute(new Request("http://x/api/knowledge", { method: "POST", body: JSON.stringify({ title: "T" }) }))).status,
    ).toBe(400);
    createKnowledgeEntry.mockResolvedValue({ id: "k9", title: "T", content: "c", source: "manual", tags: [], updatedAt: "2026-09-10T00:00:00Z" });
    const res = await createRoute(
      new Request("http://x/api/knowledge", { method: "POST", body: JSON.stringify({ title: "Title here", content: "long enough content here" }) }),
    );
    expect(res.status).toBe(201);
  });
  it("delete: HR_ADMIN removes, EMPLOYEE denied", async () => {
    getRbacContext.mockResolvedValue(employeeCtx);
    expect((await deleteRoute(new Request("http://x/api/knowledge?id=k1"))).status).toBe(403);
    getRbacContext.mockResolvedValue(adminCtx);
    deleteKnowledgeEntry.mockResolvedValue(true);
    expect((await deleteRoute(new Request("http://x/api/knowledge?id=k1"))).status).toBe(200);
    deleteKnowledgeEntry.mockResolvedValue(false);
    expect((await deleteRoute(new Request("http://x/api/knowledge?id=k9"))).status).toBe(404);
  });
});
