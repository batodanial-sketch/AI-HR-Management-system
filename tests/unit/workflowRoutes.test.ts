/**
 * Phase F REST proofs: the REAL executor behind mocked seams (RBAC context,
 * engine deps). Routes resolve auth, enforce role/ownership rules, and the
 * memory store proves org scoping + idempotent collapse end to end.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import type { RbacContext } from "@/lib/rbac";

const getRbacContext = jest.fn<Promise<RbacContext>, []>();
jest.mock("@/lib/rbac", () => ({
  getRbacContext: () => getRbacContext(),
  rbacErrorResponse: () => null,
}));

import type { DriveDeps } from "@/lib/workflows/executor";
import { memoryWorkflowStore, type MemoryWorkflowStore } from "@/lib/workflows/store";

let shared: MemoryWorkflowStore;
const holder: { deps?: DriveDeps } = {};
jest.mock("@/lib/workflows/store", () => {
  const actual = jest.requireActual("@/lib/workflows/store") as typeof import("@/lib/workflows/store");
  return { ...actual, supabaseWorkflowStore: () => shared, serviceWorkflowStore: () => shared };
});
jest.mock("@/lib/workflows/runtime", () => ({
  productionDeps: () => {
    if (!holder.deps) throw new Error("no test deps");
    return holder.deps;
  },
  systemDeps: () => {
    if (!holder.deps) throw new Error("no test deps");
    return holder.deps;
  },
}));

import { GET as listWorkflows, POST as createWorkflow } from "@/app/api/workflows/route";
import { DELETE as deleteWorkflow, GET as getWorkflow, PATCH as patchWorkflow } from "@/app/api/workflows/[id]/route";
import { POST as runWorkflow } from "@/app/api/workflows/[id]/run/route";
import { POST as saveVersion } from "@/app/api/workflows/[id]/versions/route";
import { GET as listRuns } from "@/app/api/workflows/runs/route";
import { GET as getRun } from "@/app/api/workflows/runs/[runId]/route";
import { POST as cancelRun } from "@/app/api/workflows/runs/[runId]/cancel/route";
import { POST as retryRun } from "@/app/api/workflows/runs/[runId]/retry/route";
import { GET as listApprovals } from "@/app/api/workflows/approvals/route";
import { POST as approve } from "@/app/api/workflows/approvals/[id]/approve/route";
import { POST as deny } from "@/app/api/workflows/approvals/[id]/deny/route";

const ORG = "org-1";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";

const ctxFor = (role: string, userId = USER, organizationId = ORG) =>
  ({ user: { id: userId }, organizationId, role, demoMode: false }) as unknown as RbacContext;

const notifications: { userId: string; title: string }[] = [];
const paramsFor = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

function testDeps(): DriveDeps {
  return {
    store: shared,
    notify: async (n) => {
      notifications.push({ userId: n.userId, title: n.title });
    },
    audit: async () => {},
    callTool: async () => ({ ok: true, message: "1 row" }),
    proposeToolCall: async (p) => ({ proposalId: `prop-${p.toolName}` }),
    settleProposal: async () => ({ ok: true, message: "executed" }),
  };
}

const NOTIFY = (userId: string) => ({
  key: "n1",
  type: "notify" as const,
  title: "Ping",
  config: { userIds: [userId], title: "Hi", body: "Hello" },
});
const END = { key: "done", type: "end" as const, title: "Done", config: {} };
const APPROVAL = {
  key: "a1",
  type: "approval" as const,
  title: "Approve",
  config: { title: "T", reason: "R", approverMinRole: "HR_ADMIN" as const, notifyUserIds: [], context: { why: "test" } },
};

beforeEach(() => {
  notifications.length = 0;
  shared = memoryWorkflowStore();
  shared.__seedMembers([USER, OTHER]);
  holder.deps = testDeps();
  getRbacContext.mockReset();
  getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN"));
});

async function seedFlow(status = "active", steps: Record<string, unknown>[] = [NOTIFY(USER), END]) {
  const wf = await shared.createWorkflow(ORG, { name: "Flow", triggerType: "manual", status }, USER);
  await shared.saveVersion(ORG, wf.id, { steps: steps as never }, USER);
  return wf;
}

describe("POST /api/workflows/:id/run", () => {
  it("401s unauthenticated, 404s unknown, 409s draft/versionless", async () => {
    getRbacContext.mockRejectedValueOnce(new Error("no session"));
    expect((await runWorkflow(new Request("http://x/api/workflows/w/run", { method: "POST", body: "{}" }), paramsFor({ id: "w" }))).status).toBe(401);
    expect((await runWorkflow(new Request("http://x/api/workflows/w/run", { method: "POST", body: "{}" }), paramsFor({ id: "missing" }))).status).toBe(404);
    const draft = await shared.createWorkflow(ORG, { name: "D", triggerType: "manual", status: "draft" }, USER);
    await shared.saveVersion(ORG, draft.id, { steps: [END] as never }, USER);
    const res = await runWorkflow(new Request(`http://x/api/workflows/${draft.id}/run`, { method: "POST", body: "{}" }), paramsFor({ id: draft.id }));
    expect(res.status).toBe(409);
    const noversion = await shared.createWorkflow(ORG, { name: "N", triggerType: "manual", status: "active" }, USER);
    const res2 = await runWorkflow(new Request(`http://x/api/workflows/${noversion.id}/run`, { method: "POST", body: "{}" }), paramsFor({ id: noversion.id }));
    expect(res2.status).toBe(409);
  });

  it("runs to completion and dedupes repeat keys without re-driving", async () => {
    const wf = await seedFlow();
    const url = `http://x/api/workflows/${wf.id}/run`;
    const first = await runWorkflow(new Request(url, { method: "POST", body: JSON.stringify({ idempotencyKey: "client-1" }) }), paramsFor({ id: wf.id }));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { data: { run: { id: string; status: string }; outcome: { outcome: string } } };
    expect(firstBody.data.run.status).toBe("succeeded");
    const second = await runWorkflow(new Request(url, { method: "POST", body: JSON.stringify({ idempotencyKey: "client-1" }) }), paramsFor({ id: wf.id }));
    const secondBody = (await second.json()) as { data: { run: { id: string }; outcome: string } };
    expect(secondBody.data.run.id).toBe(firstBody.data.run.id);
    expect(secondBody.data.outcome).toBe("deduped");
    expect(notifications.filter((n) => n.title === "Hi")).toHaveLength(1);
  });

  it("lets members run; new keys create new runs", async () => {
    getRbacContext.mockResolvedValue(ctxFor("EMPLOYEE"));
    const wf = await seedFlow();
    const url = `http://x/api/workflows/${wf.id}/run`;
    const a = (await (await runWorkflow(new Request(url, { method: "POST", body: JSON.stringify({ idempotencyKey: "a" }) }), paramsFor({ id: wf.id }))).json()) as { data: { run: { id: string } } };
    const b = (await (await runWorkflow(new Request(url, { method: "POST", body: JSON.stringify({ idempotencyKey: "b" }) }), paramsFor({ id: wf.id }))).json()) as { data: { run: { id: string } } };
    expect(a.data.run.id).not.toBe(b.data.run.id);
  });
});

describe("runs: list/get/cancel/retry", () => {
  it("scopes lists to the caller's org", async () => {
    const wf = await seedFlow();
    await runWorkflow(new Request(`http://x/api/workflows/${wf.id}/run`, { method: "POST", body: "{}" }), paramsFor({ id: wf.id }));
    await shared.createRun({ organizationId: "org-2", workflowId: wf.id, workflowVersion: 1, idempotencyKey: "x", triggerPayload: {}, initiatedBy: "zzz" });
    const res = await listRuns(new Request("http://x/api/workflows/runs"));
    const body = (await res.json()) as { data: { organizationId: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.data[0].organizationId).toBe(ORG);
  });

  it("returns run detail with approvals; 404s foreign runs", async () => {
    const wf = await seedFlow("active", [APPROVAL, END]);
    const started = (await (await runWorkflow(new Request(`http://x/api/workflows/${wf.id}/run`, { method: "POST", body: "{}" }), paramsFor({ id: wf.id }))).json()) as { data: { run: { id: string } } };
    const res = await getRun(new Request(`http://x/api/workflows/runs/${started.data.run.id}`), paramsFor({ runId: started.data.run.id }));
    const body = (await res.json()) as { data: { run: { status: string }; approvals: unknown[]; workflowName?: string } };
    expect(body.data.run.status).toBe("waiting_approval");
    expect(body.data.approvals).toHaveLength(1);
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN", USER, "org-2"));
    expect((await getRun(new Request("http://x/api/workflows/runs/x"), paramsFor({ runId: started.data.run.id })))).toBeTruthy();
    const foreign = await getRun(new Request(`http://x/api/workflows/runs/x`), paramsFor({ runId: started.data.run.id }));
    expect(foreign.status).toBe(404);
  });

  it("cancel: initiator ok, stranger forbidden, admin ok, terminal rejected", async () => {
    const wf = await seedFlow("active", [APPROVAL, END]);
    const started = (await (await runWorkflow(new Request(`http://x/api/workflows/${wf.id}/run`, { method: "POST", body: "{}" }), paramsFor({ id: wf.id }))).json()) as { data: { run: { id: string } } };
    const url = `http://x/api/workflows/runs/${started.data.run.id}/cancel`;
    getRbacContext.mockResolvedValue(ctxFor("EMPLOYEE", OTHER));
    expect((await cancelRun(new Request(url, { method: "POST" }), paramsFor({ runId: started.data.run.id })))).toBeTruthy();
    expect((await cancelRun(new Request(url, { method: "POST" }), paramsFor({ runId: started.data.run.id }))).status).toBe(403);
    getRbacContext.mockResolvedValue(ctxFor("EMPLOYEE", USER));
    expect((await cancelRun(new Request(url, { method: "POST" }), paramsFor({ runId: started.data.run.id }))).status).toBe(200);
    // Terminal now — admin cancel rejects with transition error (500 honest, never silent).
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN", OTHER));
    expect((await cancelRun(new Request(url, { method: "POST" }), paramsFor({ runId: started.data.run.id }))).status).toBe(500);
  });

  it("retry: non-drivable states reject honestly", async () => {
    const wf = await seedFlow();
    const started = (await (await runWorkflow(new Request(`http://x/api/workflows/${wf.id}/run`, { method: "POST", body: "{}" }), paramsFor({ id: wf.id }))).json()) as { data: { run: { id: string } } };
    const res = await retryRun(new Request(`http://x/api/workflows/runs/${started.data.run.id}/retry`, { method: "POST" }), paramsFor({ runId: started.data.run.id }));
    expect(res.status).toBe(409);
  });
});

describe("approvals: list/decide", () => {
  it("list requires MANAGER+; approve requires the step tier", async () => {
    const wf = await seedFlow("active", [APPROVAL, END]);
    await runWorkflow(new Request(`http://x/api/workflows/${wf.id}/run`, { method: "POST", body: "{}" }), paramsFor({ id: wf.id }));
    getRbacContext.mockResolvedValue(ctxFor("EMPLOYEE"));
    expect((await listApprovals(new Request("http://x/api/workflows/approvals"))).status).toBe(403);
    getRbacContext.mockResolvedValue(ctxFor("MANAGER"));
    const listed = (await (await listApprovals(new Request("http://x/api/workflows/approvals"))).json()) as { data: { id: string; request: { approverMinRole: string } }[] };
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].request.approverMinRole).toBe("HR_ADMIN");
    // MANAGER cannot decide an HR_ADMIN-gated approval.
    expect((await approve(new Request("http://x/approve", { method: "POST" }), paramsFor({ id: listed.data[0].id }))).status).toBe(403);
    // The initiator cannot decide their own run (separation of duties)…
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN", USER));
    const selfDealing = (await (await approve(new Request("http://x/approve", { method: "POST" }), paramsFor({ id: listed.data[0].id }))).json()) as { error: string };
    expect(selfDealing.error).toMatch(/Separation of duties/);
    // …but a second admin can.
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN", OTHER));
    const decided = await approve(new Request("http://x/approve", { method: "POST" }), paramsFor({ id: listed.data[0].id }));
    expect(decided.status).toBe(200);
    const body = (await decided.json()) as { data: { run: { status: string }; outcome: { outcome: string } } };
    expect(body.data.run.status).toBe("succeeded");
  });

  it("deny fails the run permanently", async () => {
    const wf = await seedFlow("active", [APPROVAL, END]);
    await runWorkflow(new Request(`http://x/api/workflows/${wf.id}/run`, { method: "POST", body: "{}" }), paramsFor({ id: wf.id }));
    const listed = (await (await listApprovals(new Request("http://x/api/workflows/approvals"))).json()) as { data: { id: string }[] };
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN", OTHER));
    const res = await deny(new Request("http://x/deny", { method: "POST" }), paramsFor({ id: listed.data[0].id }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { run: { status: string; errorCode: string } } };
    expect(body.data.run.status).toBe("failed");
    expect(body.data.run.errorCode).toBe("PERMANENT_ERROR");
  });
});

describe("workflows + versions", () => {
  it("lists definitions and serves one with its steps", async () => {
    const wf = await seedFlow();
    const listed = (await (await listWorkflows(new Request("http://x/api/workflows"))).json()) as { data: { id: string }[]; total: number };
    expect(listed.total).toBe(1);
    const one = (await (await getWorkflow(new Request(`http://x/api/workflows/${wf.id}`), paramsFor({ id: wf.id }))).json()) as { data: { latestVersion: number; steps: unknown[] } };
    expect(one.data.latestVersion).toBe(1);
    expect(one.data.steps).toHaveLength(2);
  });

  it("create: HR_ADMIN+ only, always a draft, template/steps validated", async () => {
    getRbacContext.mockResolvedValue(ctxFor("EMPLOYEE"));
    expect((await createWorkflow(new Request("http://x/api/workflows", { method: "POST", body: "{}" }))).status).toBe(403);
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN"));
    // Blank draft + client status is ignored (forced draft).
    const blankRes = await createWorkflow(new Request("http://x/api/workflows", { method: "POST", body: JSON.stringify({ name: "Blank", status: "active" }) }));
    const blank = (await blankRes.json()) as { data: { id: string; status: string; version: number | null } };
    expect(blank.data.status).toBe("draft");
    expect(blank.data.version).toBeNull();
    // Template instantiation saves v1.
    const templatedRes = await createWorkflow(
      new Request("http://x/api/workflows", { method: "POST", body: JSON.stringify({ fromTemplate: { templateId: "new_hire_welcome", params: { notifyUserIds: [USER] } } }) }),
    );
    const templated = (await templatedRes.json()) as { data: { id: string; status: string; version: number; triggerEvent: string } };
    expect(templated.data.status).toBe("draft");
    expect(templated.data.version).toBe(1);
    expect(templated.data.triggerEvent).toBe("employee.created");
    const detailRes = await getWorkflow(new Request(`http://x/api/workflows/${templated.data.id}`), paramsFor({ id: templated.data.id }));
    const detail = (await detailRes.json()) as { data: { steps: { type: string }[] } };
    expect(detail.data.steps.map((s) => s.type)).toEqual(["notify", "end"]);
    // Unknown template, bad params, bad steps, both-shapes all 400.
    for (const body of [
      { fromTemplate: { templateId: "nope", params: {} } },
      { fromTemplate: { templateId: "new_hire_welcome", params: { notifyUserIds: [] } } },
      { steps: [{ key: "x", type: "webhook_call", title: "X", config: {} }] },
      { fromTemplate: { templateId: "new_hire_welcome", params: { notifyUserIds: [USER] } }, steps: [END] },
    ]) {
      expect((await createWorkflow(new Request("http://x/api/workflows", { method: "POST", body: JSON.stringify(body) }))).status).toBe(400);
    }
  });

  it("create: draft cap forces curation", async () => {
    for (let i = 0; i < 25; i++) {
      await shared.createWorkflow(ORG, { name: `D${i}`, triggerType: "manual", status: "draft" }, USER);
    }
    const res = await createWorkflow(new Request("http://x/api/workflows", { method: "POST", body: "{}" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("DRAFT_CAP");
  });

  it("patch: strict lifecycle, activation needs a version", async () => {
    const noversion = await shared.createWorkflow(ORG, { name: "N", triggerType: "manual", status: "draft" }, USER);
    const url = `http://x/api/workflows/${noversion.id}`;
    getRbacContext.mockResolvedValue(ctxFor("EMPLOYEE"));
    expect((await patchWorkflow(new Request(url, { method: "PATCH", body: JSON.stringify({ status: "active" }) }), paramsFor({ id: noversion.id }))).status).toBe(403);
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN"));
    const patch = (id: string, status: string) => patchWorkflow(new Request(`http://x/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }), paramsFor({ id }));
    expect((await patch(noversion.id, "active")).status).toBe(409); // no version
    expect((await patch(noversion.id, "draft")).status).toBe(200); // no-op
    expect((await patch(noversion.id, "archived")).status).toBe(200);
    expect((await patch(noversion.id, "active")).status).toBe(409); // archived→active illegal
    expect((await patch(noversion.id, "draft")).status).toBe(200); // archived→draft ok
    expect((await patch("missing", "active")).status).toBe(404);
    const wf = await seedFlow("draft", [END]);
    expect((await patch(wf.id, "active")).status).toBe(200);
    expect((await patch(wf.id, "draft")).status).toBe(409); // active→draft illegal
    expect((await patch(wf.id, "archived")).status).toBe(200);
  });

  it("delete: draft-only, never with run history", async () => {
    const wf = await seedFlow("draft", [END]);
    const url = `http://x/api/workflows/${wf.id}`;
    getRbacContext.mockResolvedValue(ctxFor("EMPLOYEE"));
    expect((await deleteWorkflow(new Request(url, { method: "DELETE" }), paramsFor({ id: wf.id }))).status).toBe(403);
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN"));
    const del = (id: string) => deleteWorkflow(new Request(`http://x/api/workflows/${id}`, { method: "DELETE" }), paramsFor({ id }));
    expect((await del("missing")).status).toBe(404);
    // Draft with a run cannot be deleted.
    const withRun = await seedFlow("draft", [END]);
    await shared.createRun({ organizationId: ORG, workflowId: withRun.id, workflowVersion: 1, idempotencyKey: "r1", triggerPayload: {}, initiatedBy: USER });
    expect((await del(withRun.id)).status).toBe(409);
    // Active cannot be deleted.
    const active = await seedFlow("active", [END]);
    expect((await del(active.id)).status).toBe(409);
    // Clean draft deletes; then reads 404.
    expect((await del(wf.id)).status).toBe(200);
    expect((await getWorkflow(new Request(url), paramsFor({ id: wf.id }))).status).toBe(404);
  });

  it("versions: HR_ADMIN+ only, steps validated", async () => {
    const wf = await seedFlow();
    const url = `http://x/api/workflows/${wf.id}/versions`;
    getRbacContext.mockResolvedValue(ctxFor("EMPLOYEE"));
    expect((await saveVersion(new Request(url, { method: "POST", body: "{}" }), paramsFor({ id: wf.id }))).status).toBe(403);
    getRbacContext.mockResolvedValue(ctxFor("HR_ADMIN"));
    expect((await saveVersion(new Request(url, { method: "POST", body: JSON.stringify({ steps: [{ key: "x", type: "webhook_call", title: "X", config: {} }] }) }), paramsFor({ id: wf.id }))).status).toBe(400);
    const ok = await saveVersion(new Request(url, { method: "POST", body: JSON.stringify({ steps: [END] }) }), paramsFor({ id: wf.id }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: { version: number } }).data.version).toBe(2);
  });
});
