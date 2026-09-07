import "server-only";

import { createHash } from "node:crypto";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/audit";
import { metrics } from "@/lib/observability/metrics";

/**
 * Copilot proposal lifecycle (server-authoritative).
 *
 *   model emits a write tool_call
 *     → `createProposal`  (arguments frozen + hashed server-side, 15-min TTL)
 *     → client shows the approval card and later resends ONLY the proposal id
 *     → `claimProposal`   (authorization re-checked against the CURRENT
 *                          canonical membership inside the database; exactly
 *                          one claimant wins the pending → executing transition)
 *     → tool executes under the caller's session
 *     → `finishProposal`  (single executing → executed|failed transition,
 *                          receipt persisted, audit written)
 *
 * The model can never bypass this: it only ever produces a *pending* row and
 * has no path to `claim`. The client can never substitute arguments: the
 * executed arguments are read back from the row, and the hash is re-verified.
 *
 * Demo mode (no Supabase) keeps an in-memory table with identical semantics so
 * the unit suite and the local preview exercise the same state machine.
 */

export type ProposalStatus = "pending" | "approved" | "executing" | "executed" | "failed" | "denied" | "expired";

export interface Proposal {
  id: string;
  organizationId: string;
  actorId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  argumentsHash: string;
  status: ProposalStatus;
  expiresAt: string;
  approvedBy: string | null;
  receipt: Record<string, unknown> | null;
}

export class ProposalError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "ALREADY_DECIDED" | "EXPIRED" | "TAMPERED" | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

export function hashArguments(args: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

const PROPOSAL_TTL_MS = 15 * 60 * 1000;

/* ── demo-mode store (identical state machine, process-local) ─────────── */
const demoStore = new Map<string, Proposal>();

function rowToProposal(row: Record<string, unknown>): Proposal {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    actorId: String(row.actor_id),
    toolName: String(row.tool_name),
    arguments: (row.arguments as Record<string, unknown>) ?? {},
    argumentsHash: String(row.arguments_hash),
    status: row.status as ProposalStatus,
    expiresAt: String(row.expires_at),
    approvedBy: (row.approved_by as string | null) ?? null,
    receipt: (row.receipt as Record<string, unknown> | null) ?? null,
  };
}

function mapDbError(message: string): ProposalError {
  if (/not found/i.test(message)) return new ProposalError("NOT_FOUND", "Proposal not found.");
  if (/expired/i.test(message)) return new ProposalError("EXPIRED", "Proposal expired — ask again to create a new one.");
  if (/already|not pending|not executing/i.test(message)) return new ProposalError("ALREADY_DECIDED", "Proposal was already decided.");
  if (/membership|authorized|permitted|unauthenticated|42501|28000/i.test(message)) return new ProposalError("FORBIDDEN", "You are not authorized to approve this proposal.");
  return new ProposalError("UNAVAILABLE", "Proposal service unavailable.");
}

export interface ProposalActor {
  actorId: string;
  organizationId: string;
  /** Canonical tier of the caller (already resolved by the RBAC layer). */
  role: "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE";
  demoMode: boolean;
}

const PRIVILEGED = new Set(["SUPER_ADMIN", "HR_ADMIN", "MANAGER"]);

export async function createProposal(
  actor: ProposalActor,
  toolName: string,
  args: Record<string, unknown>,
  requestId: string | null,
): Promise<Proposal> {
  const argumentsHash = hashArguments(args);
  if (actor.demoMode || !hasSupabaseEnv()) {
    const id = crypto.randomUUID();
    const proposal: Proposal = {
      id,
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      toolName,
      arguments: args,
      argumentsHash,
      status: "pending",
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
      approvedBy: null,
      receipt: null,
    };
    demoStore.set(id, proposal);
    metrics.increment("copilot_proposals_total", { outcome: "created" });
    return proposal;
  }
  const { data, error } = await serverClient().rpc("copilot_proposal_create" as never, {
    p_organization_id: actor.organizationId,
    p_tool_name: toolName,
    p_arguments: args,
    p_request_id: requestId,
  } as never);
  if (error || !data) {
    metrics.increment("copilot_proposal_failures_total", { stage: "create" });
    throw mapDbError(error?.message ?? "no row");
  }
  metrics.increment("copilot_proposals_total", { outcome: "created" });
  return rowToProposal(data as Record<string, unknown>);
}

/**
 * Claims a proposal for execution. Re-checks authorization against the CURRENT
 * membership (database-side for Supabase; against the freshly resolved RBAC
 * context in demo mode) and verifies the frozen arguments hash.
 */
export async function claimProposal(actor: ProposalActor, proposalId: string): Promise<Proposal> {
  let proposal: Proposal;
  if (actor.demoMode || !hasSupabaseEnv()) {
    const row = demoStore.get(proposalId);
    if (!row || row.organizationId !== actor.organizationId) throw new ProposalError("NOT_FOUND", "Proposal not found.");
    if (row.actorId !== actor.actorId && !PRIVILEGED.has(actor.role)) throw new ProposalError("FORBIDDEN", "You are not authorized to approve this proposal.");
    if (!PRIVILEGED.has(actor.role)) throw new ProposalError("FORBIDDEN", "Your role cannot execute consequential actions.");
    if (row.status !== "pending") throw new ProposalError("ALREADY_DECIDED", `Proposal already ${row.status}.`);
    if (Date.parse(row.expiresAt) <= Date.now()) {
      row.status = "expired";
      throw new ProposalError("EXPIRED", "Proposal expired.");
    }
    row.status = "executing";
    row.approvedBy = actor.actorId;
    proposal = row;
  } else {
    const { data, error } = await serverClient().rpc("copilot_proposal_claim" as never, { p_proposal_id: proposalId } as never);
    if (error || !data) {
      metrics.increment("copilot_proposal_failures_total", { stage: "claim" });
      throw mapDbError(error?.message ?? "no row");
    }
    proposal = rowToProposal(data as Record<string, unknown>);
    if (proposal.status === "expired") {
      metrics.increment("copilot_proposals_total", { outcome: "expired" });
      throw new ProposalError("EXPIRED", "Proposal expired — ask again to create a new one.");
    }
    if (proposal.status !== "executing") {
      throw new ProposalError("ALREADY_DECIDED", `Proposal already ${proposal.status}.`);
    }
  }
  if (hashArguments(proposal.arguments) !== proposal.argumentsHash) {
    metrics.increment("copilot_proposal_failures_total", { stage: "integrity" });
    throw new ProposalError("TAMPERED", "Proposal arguments failed integrity verification.");
  }
  metrics.increment("copilot_proposals_total", { outcome: "claimed" });
  return proposal;
}

export async function finishProposal(
  actor: ProposalActor,
  proposal: Proposal,
  ok: boolean,
  result: Record<string, unknown>,
): Promise<Proposal> {
  const receipt = {
    proposalId: proposal.id,
    tool: proposal.toolName,
    argumentsHash: proposal.argumentsHash,
    approvedBy: actor.actorId,
    executedAt: new Date().toISOString(),
    outcome: ok ? "executed" : "failed",
  };
  let finished: Proposal;
  if (actor.demoMode || !hasSupabaseEnv()) {
    const row = demoStore.get(proposal.id);
    if (!row || row.status !== "executing" || row.approvedBy !== actor.actorId) {
      throw new ProposalError("ALREADY_DECIDED", "Proposal is not executing under this approver.");
    }
    row.status = ok ? "executed" : "failed";
    row.receipt = receipt;
    finished = row;
  } else {
    const { data, error } = await serverClient().rpc("copilot_proposal_finish" as never, {
      p_proposal_id: proposal.id,
      p_ok: ok,
      p_result: result,
      p_receipt: receipt,
    } as never);
    if (error || !data) {
      metrics.increment("copilot_proposal_failures_total", { stage: "finish" });
      throw mapDbError(error?.message ?? "no row");
    }
    finished = rowToProposal(data as Record<string, unknown>);
  }
  metrics.increment("copilot_proposals_total", { outcome: ok ? "executed" : "failed" });
  if (!ok) metrics.increment("copilot_proposal_failures_total", { stage: "execute" });
  await recordAuditLog({
    actorId: actor.actorId,
    actorType: "USER",
    action: `copilot.proposal.${ok ? "executed" : "failed"}`,
    targetModule: "copilot",
    targetId: proposal.id,
    changes: { receipt },
    organizationId: actor.organizationId,
  });
  return finished;
}

export async function denyProposal(actor: ProposalActor, proposalId: string): Promise<Proposal> {
  if (actor.demoMode || !hasSupabaseEnv()) {
    const row = demoStore.get(proposalId);
    if (!row || row.organizationId !== actor.organizationId) throw new ProposalError("NOT_FOUND", "Proposal not found.");
    if (row.actorId !== actor.actorId && !PRIVILEGED.has(actor.role)) throw new ProposalError("FORBIDDEN", "Not authorized.");
    if (row.status !== "pending") throw new ProposalError("ALREADY_DECIDED", `Proposal already ${row.status}.`);
    row.status = "denied";
    row.approvedBy = actor.actorId;
    metrics.increment("copilot_proposals_total", { outcome: "denied" });
    return row;
  }
  const { data, error } = await serverClient().rpc("copilot_proposal_deny" as never, { p_proposal_id: proposalId } as never);
  if (error || !data) throw mapDbError(error?.message ?? "no row");
  metrics.increment("copilot_proposals_total", { outcome: "denied" });
  return rowToProposal(data as Record<string, unknown>);
}

/** Test-only: reset the demo store between cases. */
export function __resetDemoProposals(): void {
  demoStore.clear();
}
