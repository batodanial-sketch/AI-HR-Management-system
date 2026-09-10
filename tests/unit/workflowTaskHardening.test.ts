/**
 * Phase F item 12 proofs: `updateTaskStatusAction` enforces task transitions
 * server-side and restricts mutation to owner-or-privileged.
 *
 * Drives the REAL action + REAL scope guard; only the canonical resolver
 * (auth.getUser + memberships query) and the Supabase client are stubbed.
 */
jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("react", () => {
  const actual = jest.requireActual("react") as Record<string, unknown>;
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ getAll: () => [], set: () => {} }) }));
jest.mock("@/src/lib/pythonBridge", () => ({ enqueuePythonJob: jest.fn() }));

import type { CanonicalAuthzContext } from "@/lib/authz/canonical";
import type { RbRole } from "@/lib/authz/model";

const resolveCanonicalAuthz = jest.fn<Promise<CanonicalAuthzContext>, []>();
jest.mock("@/lib/authz/canonical", () => ({
  resolveCanonicalAuthz: () => resolveCanonicalAuthz(),
}));

// In-memory tables behind a chainable stub.
const tasks = new Map<string, { id: string; organization_id: string; employee_id: string; status: string; payload_json: Record<string, unknown> }>();
const employees = new Map<string, { id: string; organization_id: string; user_id: string }>();
const auditInserts: unknown[] = [];

const stubClient = {
  from: (table: string) => ({
    select: () => ({
      eq: (_col: string, _value: string) => ({
        eq: (_col2: string, _value2: string) => ({
          maybeSingle: async () => {
            if (table === "daily_employee_tasks") {
              const row = [...tasks.values()].find((t) => t.id === _value && t.organization_id === _value2);
              return { data: row ?? null, error: null };
            }
            const row = [...employees.values()].find((e) => e.organization_id === _value && e.user_id === _value2);
            return { data: row ? { id: row.id } : null, error: null };
          },
        }),
      }),
    }),
    update: (updates: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => ({
        select: () => ({
          single: async () => {
            const row = tasks.get(id);
            if (!row) return { data: null, error: new Error("missing") };
            Object.assign(row, updates);
            return { data: row, error: null };
          },
        }),
      }),
    }),
    insert: async (row: unknown) => {
      auditInserts.push(row);
      return { data: row, error: null };
    },
  }),
};
jest.mock("@/src/lib/supabase", () => ({ isSupabaseConfigured: true, createServerSupabaseClient: async () => stubClient }));

import { updateTaskStatusAction } from "@/app/actions/workflowActions";

const ORG = "org-1";
const OWNER_USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";
const OWNER_EMP = "22222222-2222-4222-8222-222222222222";
const TASK = "44444444-4444-4444-8444-444444444444";

function authAs(userId: string, role: RbRole, roleCode: "owner" | "admin" | "manager" | "member" = "member") {
  resolveCanonicalAuthz.mockResolvedValue({
    ok: true,
    actor: { id: userId },
    membership: { userId, organizationId: ORG, roleCode, role },
  } as unknown as CanonicalAuthzContext);
}

beforeEach(() => {
  tasks.clear();
  employees.clear();
  auditInserts.length = 0;
  resolveCanonicalAuthz.mockReset();
  tasks.set(TASK, { id: TASK, organization_id: ORG, employee_id: OWNER_EMP, status: "pending", payload_json: {} });
  employees.set(OWNER_EMP, { id: OWNER_EMP, organization_id: ORG, user_id: OWNER_USER });
});

describe("updateTaskStatusAction hardening", () => {
  it("lets the owner advance their task through legal transitions", async () => {
    authAs(OWNER_USER, "EMPLOYEE");
    const res = await updateTaskStatusAction({ taskId: TASK, status: "in_progress" });
    expect(res.success).toBe(true);
    expect(tasks.get(TASK)?.status).toBe("in_progress");
    expect(auditInserts).toHaveLength(1);
  });

  it("lets HR admins move anyone's task", async () => {
    authAs(OTHER_USER, "HR_ADMIN", "admin");
    const res = await updateTaskStatusAction({ taskId: TASK, status: "completed" });
    expect(res.success).toBe(true);
  });

  it("rejects non-owners (managers included in v1) with an honest message", async () => {
    authAs(OTHER_USER, "MANAGER", "manager");
    const res = await updateTaskStatusAction({ taskId: TASK, status: "in_progress" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/only update your own tasks/);
    expect(tasks.get(TASK)?.status).toBe("pending");
  });

  it("rejects illegal transitions server-side, even for admins", async () => {
    tasks.get(TASK)!.status = "completed";
    authAs(OTHER_USER, "HR_ADMIN", "admin");
    const res = await updateTaskStatusAction({ taskId: TASK, status: "pending" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/Invalid task transition/);
    // …while legal reopens still work.
    tasks.get(TASK)!.status = "failed";
    const reopen = await updateTaskStatusAction({ taskId: TASK, status: "pending" });
    expect(reopen.success).toBe(true);
  });
});
