import { applyApprovalDecision, canDecideApproval } from "@/lib/workflows/executor";
import { productionDeps } from "@/lib/workflows/runtime";
import { mapDriveError, parseApprovalRequest, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/workflows/approvals/:id/approve — human decision (explicit UI
 * action only; there is deliberately no copilot tool for this). The
 * approver must be a real user holding the step's minimum tier; the
 * executor then settles any linked proposal and resumes the run.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const { id } = await params;
  try {
    const deps = productionDeps(new URL(request.url).origin, request.headers.get("cookie") ?? "");
    const approval = await deps.store.getApproval(actor.organizationId, id);
    if (!approval) return Response.json({ ok: false, error: "Approval was not found." }, { status: 404 });
    const existing = await deps.store.getRun(actor.organizationId, approval.runId);
    if (!existing) return Response.json({ ok: false, error: "The approval's run was not found." }, { status: 404 });
    const { approverMinRole } = parseApprovalRequest(approval.decisionNote);
    if (!canDecideApproval({ approverUserId: actor.userId, approverRole: actor.role, minRole: approverMinRole, requesterUserId: existing.initiatedBy })) {
      const selfDealing = existing.initiatedBy !== null && existing.initiatedBy === actor.userId;
      return Response.json(
        {
          ok: false,
          error: selfDealing
            ? "Separation of duties: the run initiator cannot decide their own approval."
            : `RBAC: ${approverMinRole} role required to decide this approval.`,
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }
    const { run, outcome } = await applyApprovalDecision(deps, actor.organizationId, id, { userId: actor.userId, role: actor.role, organizationId: actor.organizationId }, "approved");
    return Response.json({ ok: true, data: { run, outcome } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
