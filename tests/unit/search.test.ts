/**
 * Global search dispatcher + GET /api/search.
 *
 * Pure-function proofs (ranking, filtering, PII handling) plus route-level
 * proofs with the sub-route fetch stubbed: denied sources contribute no
 * data, validation rejects short queries, unauthenticated callers get 401.
 */
jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ getAll: () => [], set: () => {} }) }));

import type { RbacContext } from "@/lib/rbac";

const getRbacContext = jest.fn<Promise<RbacContext>, []>();
jest.mock("@/lib/rbac", () => ({
  getRbacContext: () => getRbacContext(),
  rbacErrorResponse: () => null,
}));

import {
  mergeRankedResults,
  pickCandidates,
  pickDocuments,
  pickEmployees,
  pickKnowledge,
  tokenizeSearchQuery,
} from "@/lib/search/dispatch";
import { GET } from "@/app/api/search/route";

const MEMBER = { role: "MEMBER", scope: "organization", demoMode: false } as unknown as RbacContext;

beforeEach(() => {
  jest.restoreAllMocks();
  getRbacContext.mockReset();
  getRbacContext.mockResolvedValue(MEMBER);
});

describe("tokenizeSearchQuery", () => {
  it("lowercases, drops short tokens, caps length", () => {
    expect(tokenizeSearchQuery("  PTO Policy 2026 ")).toEqual(["pto", "policy", "2026"]);
    expect(tokenizeSearchQuery("a b")).toEqual([]);
  });
});

describe("pickEmployees", () => {
  const payload = {
    success: true,
    data: [
      {
        employee: { id: "e1", first_name: "Aisha", last_name: "Khan", title: "Engineer", department: "R&D", work_email: "aisha@x.io" },
        department: { name: "Research" },
        jobTitle: { title: "Senior Engineer" },
      },
      {
        employee: { id: "e2", first_name: "Bob", last_name: "Lee", title: "Designer", department: "Design" },
        department: null,
        jobTitle: null,
      },
    ],
  };
  it("matches AND tokens over name/title/department and links to the profile", () => {
    const picks = pickEmployees(payload, ["aisha"]);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ id: "e1", title: "Aisha Khan", href: "/employees/e1" });
    expect(picks[0].subtitle).toContain("Senior Engineer");
    expect(pickEmployees(payload, ["aisha", "designer"])).toEqual([]);
  });
  it("accepts bare arrays and skips nameless rows", () => {
    expect(pickEmployees([{ employee: { id: "x" } }], ["x"])).toEqual([]);
    expect(pickEmployees({ data: [] }, ["q"])).toEqual([]);
  });
});

describe("pickCandidates", () => {
  it("maps route rows to recruitment links with role/stage subtitles (no PII)", () => {
    const picks = pickCandidates({
      data: [{ id: "c1", firstName: "Dana", lastName: "Ray", role: "Engineer", stage: "screening" }],
    });
    expect(picks[0]).toMatchObject({ id: "c1", title: "Dana Ray", subtitle: "Engineer · screening", href: "/recruitment" });
    expect(JSON.stringify(picks)).not.toMatch(/@/);
  });
});

describe("pickDocuments", () => {
  it("filters by title/kind/owner tokens", () => {
    const payload = { data: [{ id: "d1", name: "PTO Policy 2026.pdf", kind: "policy", owner: "HR" }] };
    expect(pickDocuments(payload, ["pto"])).toHaveLength(1);
    expect(pickDocuments(payload, ["payroll"])).toEqual([]);
  });
});

describe("pickKnowledge", () => {
  it("passes route relevance through and keeps answers inline (no href)", () => {
    const picks = pickKnowledge({ data: [{ id: "k1", title: "PTO", category: "policy", relevance: 0.9, excerpt: "20 days" }] });
    expect(picks[0]).toMatchObject({ source: "knowledge", id: "k1", score: 0.9, href: null, excerpt: "20 days" });
  });
});

describe("mergeRankedResults", () => {
  it("ranks title hits above subtitle hits and breaks ties deterministically", () => {
    const ranked = mergeRankedResults(
      ["engineer"],
      [
        { source: "employees", items: [{ id: "e1", title: "Aisha Khan", subtitle: "Senior Engineer", href: "/employees/e1" }] },
        { source: "candidates", items: [{ id: "c1", title: "Engineer Dana", subtitle: "screening", href: "/recruitment" }] },
        { source: "documents", items: [] },
      ],
      [],
      10,
    );
    expect(ranked.map((r) => r.id)).toEqual(["c1", "e1"]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
  it("caps at the limit", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, title: `Engineer ${i}`, subtitle: "", href: `/employees/e${i}` }));
    expect(mergeRankedResults(["engineer"], [{ source: "employees", items }], [], 3)).toHaveLength(3);
  });
});

describe("GET /api/search", () => {
  const jsonResponse = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

  it("400s on missing/short queries", async () => {
    for (const url of ["http://x/api/search", "http://x/api/search?q=a"]) {
      const res = await GET(new Request(url));
      expect(res.status).toBe(400);
      expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: false });
    }
  });

  it("401s without an RBAC context and never fans out", async () => {
    getRbacContext.mockRejectedValueOnce(Object.assign(new Error("no session"), { status: 401 }));
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const res = await GET(new Request("http://x/api/search?q=pto"));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("merges source results and drops denied sources without leaking data", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/employees")) return jsonResponse({ success: true, data: [] });
      if (url.includes("/api/candidates")) return jsonResponse({ ok: false, error: "forbidden" }, 403);
      if (url.includes("/api/documents")) return jsonResponse({ ok: true, data: [], count: 0 });
      if (url.includes("/api/knowledge/search"))
        return jsonResponse({ ok: true, data: [{ id: "k1", title: "PTO Policy", category: "policy", relevance: 0.8, excerpt: "20 days" }], count: 1 });
      throw new Error(`unexpected ${url}`);
    });
    const res = await GET(new Request("http://x/api/search?q=pto", { headers: { cookie: "s=1" } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { id: string }[]; sources: Record<string, string> };
    expect(body.ok).toBe(true);
    expect(body.sources).toEqual({ employees: "ok", candidates: "denied", documents: "ok", knowledge: "ok" });
    expect(body.data.map((r) => r.id)).toEqual(["k1"]);
    // Cookie forwarded to sub-routes so their RBAC sees the real caller.
    expect(jest.mocked(globalThis.fetch).mock.calls[0]?.[1]).toMatchObject({ headers: { cookie: "s=1" } });
  });
});
