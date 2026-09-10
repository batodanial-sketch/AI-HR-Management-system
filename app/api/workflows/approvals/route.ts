import { z } from "zod";
import { supabaseWorkflowStore } from "@/lib/workflows/store";
import { mapDriveError, parseApprovalRequest, requireRole, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/workflows/approvals — pending/decided approvals (MANAGER+).
 * Each row carries its parsed request envelope (why/evidence/changes/
 * affected/reversible) so the Approval Center renders the full
 * Why / Evidence / What-changes / Who-is-affected / Can-it-be-undone card.
 */
const querySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "expired"]).default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const denied = requireRole(actor, "MANAGER");
  if (denied) return denied;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid query parameters." }, { status: 400 });
  }
  try {
    const store = supabaseWorkflowStore();
    const { rows, total } = await store.listApprovals(actor.organizationId, parsed.data);
    const data = await Promise.all(
      rows.map(async (approval) => {
        const run = await store.getRun(actor.organizationId, approval.runId);
        const workflow = run ? await store.getWorkflow(actor.organizationId, run.workflowId) : null;
        return { ...approval, request: parseApprovalRequest(approval.decisionNote), run, workflowName: workflow?.name ?? null };
      }),
    );
    return Response.json({ ok: true, data, total }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
