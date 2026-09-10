import { z } from "zod";
import { runIdempotencyKey } from "@/lib/workflows/idempotency";
import { driveRun } from "@/lib/workflows/executor";
import { productionDeps } from "@/lib/workflows/runtime";
import { mapDriveError, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/workflows/:id/run — start an idempotent run (any member).
 *
 * Only `active` workflows with an executable version can run; the run pins
 * the latest version at creation. Repeat posts with the same
 * `idempotencyKey` collapse onto the existing run (returned with
 * `deduped: true`, never re-driven). Consequential steps still gate on
 * human approval inside the run.
 */
const bodySchema = z.object({
  triggerPayload: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(1).max(400).refine((value) => !value.includes("|"), "must not contain '|'").optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const { id } = await params;
  const input = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid run request." }, { status: 400 });
  }
  try {
    const deps = productionDeps(new URL(request.url).origin, request.headers.get("cookie") ?? "");
    const workflow = await deps.store.getWorkflow(actor.organizationId, id);
    if (!workflow) return Response.json({ ok: false, error: "Workflow was not found." }, { status: 404 });
    if (workflow.status !== "active") {
      return Response.json({ ok: false, error: `Only active workflows can run (status: ${workflow.status}).`, code: "NOT_DRIVABLE" }, { status: 409 });
    }
    const latest = await deps.store.getLatestVersion(actor.organizationId, id);
    if (!latest) {
      return Response.json({ ok: false, error: "No executable version exists for this workflow.", code: "NOT_DRIVABLE" }, { status: 409 });
    }
    const { run, created } = await deps.store.createRun({
      organizationId: actor.organizationId,
      workflowId: id,
      workflowVersion: latest.version,
      idempotencyKey: runIdempotencyKey({
        organizationId: actor.organizationId,
        workflowId: id,
        workflowVersion: latest.version,
        stableInput: parsed.data.idempotencyKey ?? crypto.randomUUID(),
      }),
      triggerPayload: parsed.data.triggerPayload,
      initiatedBy: actor.userId,
    });
    if (!created) {
      const current = await deps.store.getRun(actor.organizationId, run.id);
      return Response.json({ ok: true, data: { run: current ?? run, outcome: "deduped" } }, { headers: { "Cache-Control": "no-store" } });
    }
    const outcome = await driveRun(deps, actor.organizationId, run.id, { userId: actor.userId, role: actor.role, organizationId: actor.organizationId });
    const final = await deps.store.getRun(actor.organizationId, run.id);
    return Response.json({ ok: true, data: { run: final ?? run, outcome } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
