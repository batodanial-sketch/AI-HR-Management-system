import { expect, test } from "@playwright/test";

/**
 * RBAC boundary enforcement — strict HTTP 403s for under-privileged roles.
 *
 * Drives the API through the real Next.js route handlers with the
 * `x-fluxentiq-e2e-role` test header (gated server-side by
 * `E2E_ROLE_OVERRIDE_ENABLED=1` — set by the Playwright webServer command and
 * inert in production). Each request resolves a real RBAC context, so the
 * assertions exercise the production enforcement path:
 *
 *   EMPLOYEE reading an HR_ADMIN module            → 403 RBAC_FORBIDDEN
 *   EMPLOYEE writing to an HR_ADMIN module         → 403 (deny-first, even
 *                                                     with no database)
 *   EMPLOYEE writing a personal record for
 *   someone outside their scope                    → 403 (ownership guard)
 *   EMPLOYEE transitioning an offboarding case     → 403 (MANAGER minimum)
 *   HR_ADMIN reading the same module               → 200 (role-based, not
 *                                                     blanket denial)
 */

const EMPLOYEE_HEADERS = { "x-fluxentiq-e2e-role": "EMPLOYEE" };
const HR_ADMIN_HEADERS = { "x-fluxentiq-e2e-role": "HR_ADMIN" };

const BENEFITS_POST_BODY = {
  name: "E2E Vision Plan",
  provider: "E2E Insurance",
  planType: "vision",
  employeeCost: 12,
  employerCost: 24,
  status: "draft",
};

const OFFBOARDING_PATCH_BODY = {
  id: "00000000-0000-4000-8000-000000000002",
  status: "completed",
};

test.describe("RBAC boundaries", () => {
  test("EMPLOYEE cannot read an HR_ADMIN module (403)", async ({ request }) => {
    const response = await request.get("/api/benefits", { headers: EMPLOYEE_HEADERS });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code?: string; error?: string };
    expect(body.code).toBe("RBAC_FORBIDDEN");
    expect(body.error).toContain("HR_ADMIN");
  });

  test("EMPLOYEE cannot write to an HR_ADMIN module — denied before availability (403)", async ({ request }) => {
    // No Supabase in this environment; a non-RBAC code path would return 503.
    // Deny-first authorization must return 403 regardless of database state.
    const response = await request.post("/api/benefits", {
      headers: { ...EMPLOYEE_HEADERS, "Content-Type": "application/json" },
      data: BENEFITS_POST_BODY,
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("RBAC_FORBIDDEN");
  });

  test("EMPLOYEE cannot create a personal record for someone outside their scope (403)", async ({ request }) => {
    const response = await request.post("/api/expenses", {
      headers: { ...EMPLOYEE_HEADERS, "Content-Type": "application/json" },
      data: {
        employeeId: "00000000-0000-4000-8000-000000000099", // not the caller
        merchant: "AWS",
        expenseDate: "2026-08-30",
        category: "Software",
        amount: 120,
        currencyCode: "USD",
      },
    });
    expect(response.status()).toBe(403);
  });

  test("EMPLOYEE cannot transition an offboarding case (MANAGER minimum, 403)", async ({ request }) => {
    const response = await request.patch("/api/offboarding", {
      headers: { ...EMPLOYEE_HEADERS, "Content-Type": "application/json" },
      data: OFFBOARDING_PATCH_BODY,
    });
    expect(response.status()).toBe(403);
  });

  test("EMPLOYEE retains access to personal-scope reads (200, empty scope)", async ({ request }) => {
    // Expenses are a personal module; EMPLOYEE gets their own (empty) scope,
    // never the org-wide list.
    const response = await request.get("/api/expenses", { headers: EMPLOYEE_HEADERS });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { ok: boolean; scope?: string; count?: number };
    expect(body.ok).toBe(true);
    expect(body.scope).toBe("self");
  });

  test("HR_ADMIN retains org-wide access to the same module (200)", async ({ request }) => {
    const response = await request.get("/api/benefits", { headers: HR_ADMIN_HEADERS });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { ok: boolean; count?: number };
    expect(body.ok).toBe(true);
    expect(body.count).toBeGreaterThan(0); // seeded fallback data
  });

  test("invalid override values are ignored (demo identity applies)", async ({ request }) => {
    // The override hook only accepts canonical RbRoles; anything else is
    // ignored and the request resolves through the normal identity path.
    const response = await request.get("/api/benefits", {
      headers: { "x-fluxentiq-e2e-role": "SOME_RANDOM_ROLE" },
    });
    expect(response.status()).toBe(200);
  });
});
