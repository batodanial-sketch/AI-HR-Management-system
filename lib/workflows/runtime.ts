import "server-only";

import { adminClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getRbacContext } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { executeCopilotTool, findCopilotTool } from "@/lib/copilot/tools";
import { claimProposal, createProposal, finishProposal, type ProposalActor } from "@/lib/copilot/proposals";
import { serviceWorkflowStore, supabaseWorkflowStore } from "./store";
import { SYSTEM_ACTOR, WorkflowDriveError, type DriveDeps } from "./executor";

/**
 * Production DriveDeps assembler — the ONLY place the memory store is NOT
 * used. Every seam delegates to a canonical implementation:
 *
 *   store   Supabase session store (RLS + explicit org scoping)
 *   notify  createNotification (session-derived org, member-verified targets)
 *   audit   recordAuditLog (sanitized, org-attributed)
 *   callTool executeCopilotTool (caller's cookie → inherits caller RBAC)
 *   propose/claim/finish  lib/copilot/proposals (frozen args, TTL, atomic
 *           claim, receipt, audit)
 *
 * Throws when Supabase is unconfigured: without a database the engine is
 * honestly unavailable (503 at the routes) — runs are never simulated.
 */
export function productionDeps(origin: string, cookie: string): DriveDeps {
  if (!hasSupabaseEnv()) {
    throw new Error("Workflow engine unavailable: Supabase is not configured.");
  }
  return {
    store: supabaseWorkflowStore(),
    notify: async (input) => {
      await createNotification({ userId: input.userId, kind: input.kind, title: input.title, description: input.description, link: input.link });
    },
    audit: async (entry) => {
      await recordAuditLog({
        actorId: entry.actorId,
        actorType: entry.actorId === SYSTEM_ACTOR ? "SYSTEM" : "USER",
        action: entry.action,
        targetModule: "workflows",
        targetId: entry.targetId,
        changes: entry.changes,
        organizationId: entry.organizationId,
      });
    },
    callTool: async (toolName, args) => {
      const definition = findCopilotTool(toolName);
      if (!definition) return { ok: false, message: `Unknown tool '${toolName}'.` };
      const result = await executeCopilotTool(definition, args, { origin, cookie });
      return { ok: result.ok, message: result.message, status: result.status };
    },
    proposeToolCall: async (input) => {
      const actor: ProposalActor = {
        actorId: input.actorId,
        organizationId: input.organizationId,
        role: input.role,
        demoMode: false,
      };
      const proposal = await createProposal(actor, input.toolName, input.args, input.requestId);
      return { proposalId: proposal.id };
    },
    settleProposal: async (input) => {
      // Re-resolve the CURRENT session for the claim — the passed approver id
      // is attribution only; authorization comes from the live context.
      const ctx = await getRbacContext();
      const actor: ProposalActor = { actorId: ctx.user.id, organizationId: ctx.organizationId, role: ctx.role, demoMode: ctx.demoMode };
      const claimed = await claimProposal(actor, input.proposalId);
      const definition = findCopilotTool(claimed.toolName);
      if (!definition) {
        await finishProposal(actor, claimed, false, { error: "unknown tool" });
        return { ok: false, message: `Unknown tool '${claimed.toolName}'.` };
      }
      const result = await executeCopilotTool(definition, claimed.arguments, { origin, cookie });
      await finishProposal(actor, claimed, result.ok, { message: result.message });
      return { ok: result.ok, message: result.message, status: result.status };
    },
  };
}

/**
 * System DriveDeps for sessionless drives (verified-webhook-triggered runs).
 * Tenancy is pinned to the resolved org at construction; notifications are
 * inserted directly (no session user exists); audit uses the admin client.
 * Tool calls and proposals are fail-closed stubs: without a caller session
 * there is no RBAC to inherit, so `tool_call` steps in system-driven runs
 * fail honestly with AUTHORIZATION_ERROR until a human resumes the run —
 * typically right after approving the step that gated it.
 */
export function systemDeps(pinnedOrganizationId: string): DriveDeps {
  if (!hasSupabaseEnv()) {
    throw new Error("Workflow engine unavailable: Supabase is not configured.");
  }
  return {
    store: serviceWorkflowStore(pinnedOrganizationId),
    notify: async (input) => {
      const { error } = await adminClient().from("notifications").insert({
        organization_id: pinnedOrganizationId,
        user_id: input.userId,
        kind: input.kind,
        title: input.title,
        description: input.description,
        link: typeof input.link === "string" && input.link.startsWith("/") && !input.link.startsWith("//") ? input.link : null,
      });
      if (error) console.error("[workflows] system notify failed:", error.message);
    },
    audit: async (entry) => {
      await recordAuditLog(
        {
          actorId: entry.actorId,
          actorType: entry.actorId === SYSTEM_ACTOR ? "SYSTEM" : "USER",
          action: entry.action,
          targetModule: "workflows",
          targetId: entry.targetId,
          changes: entry.changes,
          organizationId: entry.organizationId,
        },
        { useAdmin: true },
      );
    },
    callTool: async () => ({ ok: false, message: "Tool calls require a user session; resume this run as a signed-in user.", status: 401 }),
    proposeToolCall: async () => {
      throw new WorkflowDriveError("FORBIDDEN", "Proposals require a user session; resume this run as a signed-in user.");
    },
    settleProposal: async () => {
      throw new WorkflowDriveError("FORBIDDEN", "Proposal settlement requires a user session.");
    },
  };
}
