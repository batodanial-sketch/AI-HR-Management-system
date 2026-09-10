import { supabaseWorkflowStore } from "@/lib/workflows/store";
import { mapDriveError, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workflows/runs/:runId — run + definition + approvals (any member). */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const { runId } = await params;
  try {
    const store = supabaseWorkflowStore();
    const run = await store.getRun(actor.organizationId, runId);
    if (!run) return Response.json({ ok: false, error: "Workflow run was not found." }, { status: 404 });
    const [workflow, approvals] = await Promise.all([
      store.getWorkflow(actor.organizationId, run.workflowId),
      store.listApprovals(actor.organizationId, { runId, limit: 50 }),
    ]);
    return Response.json({ ok: true, data: { run, workflow, approvals: approvals.rows } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
