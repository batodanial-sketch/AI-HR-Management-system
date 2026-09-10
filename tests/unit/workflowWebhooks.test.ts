/**
 * Workflow webhook proofs: signature gate, org-from-business-key, exactly one
 * run per delivery, redelivery collapse, sessionless-safe driving.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import { createHmac } from "node:crypto";
import type { DriveDeps } from "@/lib/workflows/executor";
import { memoryWorkflowStore, type MemoryWorkflowStore } from "@/lib/workflows/store";

let shared: MemoryWorkflowStore;
const holder: { deps?: DriveDeps } = {};
jest.mock("@/lib/workflows/store", () => {
  const actual = jest.requireActual("@/lib/workflows/store") as typeof import("@/lib/workflows/store");
  return { ...actual, serviceWorkflowStore: () => shared };
});
jest.mock("@/lib/workflows/runtime", () => ({
  systemDeps: () => {
    if (!holder.deps) throw new Error("no test deps");
    return holder.deps;
  },
}));

// Configurable admin stub: org lookup hits + webhook receipt ledger.
const orgByTableId: Record<string, string> = {};
const receipts: { id: string; processed: boolean; error: string | null }[] = [];
const adminStub = {
  from: (table: string) => ({
    select: () => ({
      eq: (_col: string, id: string) => ({
        maybeSingle: async () => {
          const org = orgByTableId[`${table}:${id}`];
          return { data: org ? { organization_id: org } : null };
        },
      }),
    }),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          const id = `rcpt-${receipts.length + 1}`;
          receipts.push({ id, processed: Boolean(row.processed), error: null });
          return { data: { id }, error: null };
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: async () => {
        const last = receipts[receipts.length - 1];
        if (last) {
          last.processed = Boolean(patch.processed);
          last.error = typeof patch.processing_error === "string" ? patch.processing_error : null;
        }
        return { error: null };
      },
    }),
  }),
};
jest.mock("@/lib/supabase/server", () => ({ adminClient: () => adminStub, hasSupabaseEnv: () => true }));

import { GET, POST } from "@/app/api/workflows/webhooks/route";

const SECRET = "test-webhook-secret";
const ORG = "org-1";
const EMPLOYEE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const sent: string[] = [];

function signed(body: unknown, secret = SECRET, extraHeaders: Record<string, string> = {}): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  return new Request("http://x/api/workflows/webhooks", {
    method: "POST",
    body: raw,
    headers: { "x-fluxentiq-workflow-signature": sig, ...extraHeaders },
  });
}

beforeEach(() => {
  process.env.WORKFLOW_WEBHOOK_SECRET = SECRET;
  for (const key of Object.keys(orgByTableId)) delete orgByTableId[key];
  receipts.length = 0;
  sent.length = 0;
  shared = memoryWorkflowStore();
  shared.__seedMembers([USER]);
  holder.deps = {
    store: shared,
    notify: async (n) => {
      sent.push(n.title);
    },
    audit: async () => {},
    callTool: async () => ({ ok: false, message: "sessionless", status: 401 }),
    proposeToolCall: async () => {
      throw new Error("sessionless");
    },
    settleProposal: async () => {
      throw new Error("sessionless");
    },
  };
});

afterEach(() => {
  delete process.env.WORKFLOW_WEBHOOK_SECRET;
});

async function seedEventFlow(status = "active") {
  const wf = await shared.createWorkflow(ORG, { name: "Onboard", triggerType: "event", triggerEvent: "employee.created", status }, USER);
  await shared.saveVersion(
    ORG,
    wf.id,
    { steps: [{ key: "n1", type: "notify", title: "Ping", config: { userIds: [USER], title: "Welcome", body: "Hi" } }, { key: "done", type: "end", title: "Done", config: {} }] as never },
    USER,
  );
  return wf;
}

describe("workflow webhooks", () => {
  it("describes supported events", async () => {
    const body = (await (await GET()).json()) as { supportedEvents: string[] };
    expect(body.supportedEvents).toContain("employee.created");
  });

  it("fails closed: 503 unconfigured, 401 bad signature, 400 malformed", async () => {
    delete process.env.WORKFLOW_WEBHOOK_SECRET;
    expect((await POST(signed({ event: "employee.created", payload: {} }))).status).toBe(503);
    process.env.WORKFLOW_WEBHOOK_SECRET = SECRET;
    expect((await POST(signed({ event: "employee.created", payload: {} }, "wrong"))).status).toBe(401);
    expect((await POST(signed("not-json"))).status).toBe(400);
    expect((await POST(signed({ event: "hr.unknown", payload: {} }))).status).toBe(400);
  });

  it("200s with zero processed when no org resolves (never spoofs tenancy)", async () => {
    await seedEventFlow();
    const res = await POST(signed({ event: "employee.created", deliveryId: "d1", payload: { employee_id: EMPLOYEE } }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { processed: number }).processed).toBe(0);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].processed).toBe(true);
    expect(receipts[0].error).toMatch(/unresolvable/);
    const { total } = await shared.listRuns(ORG, {});
    expect(total).toBe(0);
  });

  it("starts exactly one run per delivery and redeliveries dedupe", async () => {
    orgByTableId[`employees:${EMPLOYEE}`] = ORG;
    const wf = await seedEventFlow();
    const body = { event: "employee.created", deliveryId: "d1", payload: { employee_id: EMPLOYEE } };
    const first = (await (await POST(signed(body))).json()) as { processed: number; results: { runId: string; created: boolean; outcome: string }[] };
    expect(first.processed).toBe(1);
    expect(first.results[0].created).toBe(true);
    const run = await shared.getRun(ORG, first.results[0].runId);
    expect(run?.status).toBe("succeeded");
    expect(run?.initiatedBy).toBeNull();
    expect(sent).toEqual(["Welcome"]);
    // Redelivery: same run, no second drive.
    const second = (await (await POST(signed(body))).json()) as { results: { runId: string; created: boolean; outcome: string }[] };
    expect(second.results[0].runId).toBe(first.results[0].runId);
    expect(second.results[0].created).toBe(false);
    expect(second.results[0].outcome).toBe("deduped");
    expect(sent).toEqual(["Welcome"]);
    // …while a fresh delivery starts a fresh run.
    const third = (await (await POST(signed({ ...body, deliveryId: "d2" }))).json()) as { results: { runId: string }[] };
    expect(third.results[0].runId).not.toBe(first.results[0].runId);
    expect(wf.id).toBeTruthy();
  });

  it("skips draft and versionless workflows honestly", async () => {
    orgByTableId[`employees:${EMPLOYEE}`] = ORG;
    await shared.createWorkflow(ORG, { name: "Draft", triggerType: "event", triggerEvent: "employee.created", status: "draft" }, USER);
    const body = { event: "employee.created", deliveryId: "d9", payload: { employee_id: EMPLOYEE } };
    const res = (await (await POST(signed(body))).json()) as { processed: number };
    expect(res.processed).toBe(0);
  });
});
