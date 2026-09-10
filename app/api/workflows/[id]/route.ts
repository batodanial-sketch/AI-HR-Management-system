import { z } from "zod";
import { supabaseWorkflowStore } from "@/lib/workflows/store";
import { WorkflowDriveError } from "@/lib/workflows/executor";
import { mapDriveError, requireRole, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workflows/:id — definition + latest executable version (any member). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const { id } = await params;
  try {
    const store = supabaseWorkflowStore();
    const workflow = await store.getWorkflow(actor.organizationId, id);
    if (!workflow) return Response.json({ ok: false, error: "Workflow was not found." }, { status: 404 });
    const latest = await store.getLatestVersion(actor.organizationId, id);
    return Response.json(
      { ok: true, data: { ...workflow, latestVersion: latest?.version ?? null, steps: latest?.graph.steps ?? [] } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mapDriveError(error);
  }
}

/**
 * Definition lifecycle map — the ONLY legal transitions, enforced here
 * (server-side). Activation additionally requires an executable version,
 * so a versionless draft can never become runnable.
 */
const LIFECYCLE: Record<string, string[]> = {
  draft: ["active", "archived"],
  active: ["archived"],
  archived: ["draft"],
};

/**
 * PATCH /api/workflows/:id — transition status (HR_ADMIN+, human only;
 * there is deliberately no copilot tool for this). Same-status is an
 * honest no-op; anything outside LIFECYCLE is rejected.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const denied = requireRole(actor, "HR_ADMIN");
  if (denied) return denied;
  const { id } = await params;
  const parsed = z.object({ status: z.enum(["draft", "active", "archived"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Body must be { status: draft | active | archived }." }, { status: 400 });
  }
  try {
    const store = supabaseWorkflowStore();
    const workflow = await store.getWorkflow(actor.organizationId, id);
    if (!workflow) return Response.json({ ok: false, error: "Workflow was not found." }, { status: 404 });
    if (workflow.status === parsed.data.status) {
      return Response.json({ ok: true, data: { ...workflow, unchanged: true } }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!(LIFECYCLE[workflow.status] ?? []).includes(parsed.data.status)) {
      throw new WorkflowDriveError("NOT_DRIVABLE", `Cannot transition a ${workflow.status} workflow to ${parsed.data.status}.`);
    }
    if (parsed.data.status === "active") {
      const latest = await store.getLatestVersion(actor.organizationId, id);
      if (!latest) {
        throw new WorkflowDriveError("NOT_DRIVABLE", "Cannot activate a workflow with no executable version. Publish one first.");
      }
    }
    const updated = await store.updateWorkflowStatus(actor.organizationId, id, parsed.data.status);
    return Response.json({ ok: true, data: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}

/**
 * DELETE /api/workflows/:id — remove a draft that never ran (HR_ADMIN+).
 * Active/archived definitions and anything with run history are kept:
 * runs are immutable history and must never be orphaned.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const denied = requireRole(actor, "HR_ADMIN");
  if (denied) return denied;
  const { id } = await params;
  try {
    const store = supabaseWorkflowStore();
    const workflow = await store.getWorkflow(actor.organizationId, id);
    if (!workflow) return Response.json({ ok: false, error: "Workflow was not found." }, { status: 404 });
    if (workflow.status !== "draft") {
      throw new WorkflowDriveError("NOT_DRIVABLE", `Only drafts can be deleted (status: ${workflow.status}). Archive it instead.`);
    }
    const { total } = await store.listRuns(actor.organizationId, { workflowId: id, limit: 1 });
    if (total > 0) {
      throw new WorkflowDriveError("NOT_DRIVABLE", "Cannot delete a workflow with run history. Archive it instead.");
    }
    const deleted = await store.deleteWorkflow(actor.organizationId, id);
    if (!deleted) return Response.json({ ok: false, error: "Workflow was not found." }, { status: 404 });
    return Response.json({ ok: true, data: { deleted: true, id } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
