/**
 * Phase R — Copilot proposal state machine (demo-mode store; the PostgreSQL
 * implementation of the same machine is exercised by
 * scripts/db/authz-rls-suite.mjs → "proposal" section on a real database).
 *
 *   model → proposal → human confirmation → authorization recheck →
 *   single-winner execution → receipt/audit
 */
jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ getAll: () => [], set: () => {} }) }));
jest.mock("@/lib/supabase/server", () => ({ hasSupabaseEnv: () => false, serverClient: () => { throw new Error("not in demo"); }, adminClient: () => { throw new Error("not in demo"); } }));
const auditSpy = jest.fn(async () => undefined);
jest.mock("@/lib/audit", () => ({ recordAuditLog: (...args: unknown[]) => auditSpy(...(args as [])) }));

import { __resetDemoProposals, claimProposal, createProposal, denyProposal, finishProposal, hashArguments, ProposalError, type ProposalActor } from "@/lib/copilot/proposals";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const admin: ProposalActor = { actorId: "admin-1", organizationId: ORG, role: "HR_ADMIN", demoMode: true };
const manager: ProposalActor = { actorId: "mgr-1", organizationId: ORG, role: "MANAGER", demoMode: true };
const employee: ProposalActor = { actorId: "emp-1", organizationId: ORG, role: "EMPLOYEE", demoMode: true };
const foreign: ProposalActor = { actorId: "owner-b", organizationId: OTHER_ORG, role: "SUPER_ADMIN", demoMode: true };
const args = { assetTag: "LT-1", name: "Laptop", category: "hardware" };

beforeEach(() => {
  __resetDemoProposals();
  auditSpy.mockClear();
});

test("proposal freezes arguments with a hash; model output cannot execute", async () => {
  const p = await createProposal(admin, "create_asset", args, "req-1");
  expect(p.status).toBe("pending");
  expect(p.argumentsHash).toBe(hashArguments(args));
  expect(p.arguments).toEqual(args);
});

test("happy path: confirm → recheck → execute → receipt/audit", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  const claimed = await claimProposal(admin, p.id);
  expect(claimed.status).toBe("executing");
  const done = await finishProposal(admin, claimed, true, { id: "asset-1" });
  expect(done.status).toBe("executed");
  expect(done.receipt).toMatchObject({ proposalId: p.id, tool: "create_asset", approvedBy: "admin-1", outcome: "executed" });
  expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "copilot.proposal.executed", targetId: p.id, organizationId: ORG }));
});

test("EMPLOYEE cannot approve their own consequential proposal", async () => {
  const p = await createProposal(employee, "create_asset", args, null);
  await expect(claimProposal(employee, p.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("another tenant cannot see or approve the proposal", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  await expect(claimProposal(foreign, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(denyProposal(foreign, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("authorization is re-checked at approval time (role downgraded after creation)", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  const downgraded: ProposalActor = { ...admin, role: "EMPLOYEE" };
  await expect(claimProposal(downgraded, p.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("a manager may approve a peer's proposal in the same tenant; employees may not", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  await expect(claimProposal(employee, p.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await claimProposal(manager, p.id)).status).toBe("executing");
});

test("duplicate approval: exactly one winner, second attempt is ALREADY_DECIDED", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  const results = await Promise.allSettled([claimProposal(admin, p.id), claimProposal(manager, p.id), claimProposal(admin, p.id)]);
  const winners = results.filter((r) => r.status === "fulfilled");
  const losers = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(2);
  for (const l of losers) expect((l.reason as ProposalError).code).toBe("ALREADY_DECIDED");
});

test("duplicate execution: finish is a single transition", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  const claimed = await claimProposal(admin, p.id);
  await finishProposal(admin, claimed, true, {});
  await expect(finishProposal(admin, claimed, true, {})).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
});

test("denied proposals cannot later be approved", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  expect((await denyProposal(admin, p.id)).status).toBe("denied");
  await expect(claimProposal(admin, p.id)).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
});

test("expired proposals are refused", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  const spy = jest.spyOn(Date, "now").mockReturnValue(Date.parse(p.expiresAt) + 1000);
  try {
    await expect(claimProposal(admin, p.id)).rejects.toMatchObject({ code: "EXPIRED" });
  } finally {
    spy.mockRestore();
  }
});

test("failed execution is recorded as failed with a receipt and audit", async () => {
  const p = await createProposal(admin, "create_asset", args, null);
  const claimed = await claimProposal(admin, p.id);
  const done = await finishProposal(admin, claimed, false, { error: "downstream 500" });
  expect(done.status).toBe("failed");
  expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "copilot.proposal.failed" }));
});
