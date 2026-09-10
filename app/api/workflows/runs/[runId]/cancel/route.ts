import { cancelRun } from "@/lib/workflows/executor";
import { productionDeps } from "@/lib/workflows/runtime";
import { canManageRun, mapDriveError, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/workflows/runs/:runId/cancel — initiator or HR_ADMIN+. */
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const { runId } = await params;
  try {
    const deps = productionDeps(new URL(request.url).origin, request.headers.get("cookie") ?? "");
    const run = await deps.store.getRun(actor.organizationId, runId);
    if (!run) return Response.json({ ok: false, error: "Workflow run was not found." }, { status: 404 });
    if (!canManageRun(actor, run.initiatedBy)) {
      return Response.json({ ok: false, error: "Only the initiator or an HR administrator can cancel this run.", code: "FORBIDDEN" }, { status: 403 });
    }
    const cancelled = await cancelRun(deps, actor.organizationId, runId, { userId: actor.userId, role: actor.role, organizationId: actor.organizationId });
    return Response.json({ ok: true, data: cancelled }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
