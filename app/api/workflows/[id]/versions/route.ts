import { z } from "zod";
import { supabaseWorkflowStore } from "@/lib/workflows/store";
import { workflowStepsSchema } from "@/lib/workflows/steps";
import { mapDriveError, requireRole, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/workflows/:id/versions — publish a new executable version
 * (HR_ADMIN+; definition change). Steps are validated against the
 * allowlisted vocabulary and stored normalized. Active runs stay pinned
 * to the version they started with; only new runs pick this one up.
 */
const bodySchema = z.object({ steps: workflowStepsSchema });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const denied = requireRole(actor, "HR_ADMIN");
  if (denied) return denied;
  const { id } = await params;
  const input = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(input ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json({ ok: false, error: first?.message ?? "Invalid workflow steps.", code: "VALIDATION" }, { status: 400 });
  }
  try {
    const store = supabaseWorkflowStore();
    const workflow = await store.getWorkflow(actor.organizationId, id);
    if (!workflow) return Response.json({ ok: false, error: "Workflow was not found." }, { status: 404 });
    const version = await store.saveVersion(actor.organizationId, id, { steps: parsed.data.steps }, actor.userId);
    return Response.json({ ok: true, data: version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
