import { z } from "zod";
import { supabaseWorkflowStore } from "@/lib/workflows/store";
import { workflowStepsSchema } from "@/lib/workflows/steps";
import { instantiateTemplate } from "@/lib/workflows/bridge";
import { WorkflowDriveError } from "@/lib/workflows/executor";
import { mapDriveError, requireRole, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workflows — list workflow definitions (any member, org-scoped). */
const querySchema = z.object({
  status: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
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
    const { rows, total } = await supabaseWorkflowStore().listWorkflows(actor.organizationId, parsed.data);
    return Response.json({ ok: true, data: rows, total }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}

/** Honest bound: drafts are inert but not free — 25 per org forces curation. */
const MAX_DRAFTS_PER_ORG = 25;

/**
 * POST /api/workflows — create a definition (HR_ADMIN+). ALWAYS a draft:
 * drafts cannot run and cannot be activated except by a human PATCH. Three
 * shapes: blank draft, `fromTemplate` (validated bridge instantiation +
 * saved v1), or explicit `steps` (validated, saved as v1). Any client
 * `status` is ignored — only PATCH transitions status.
 */
const createSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  triggerType: z.enum(["manual", "event", "scheduled"]).default("manual"),
  triggerEvent: z.string().trim().min(1).max(200).optional(),
  fromTemplate: z.object({ templateId: z.string().min(1).max(80), params: z.record(z.string(), z.unknown()).default({}) }).optional(),
  steps: workflowStepsSchema.optional(),
});

export async function POST(request: Request): Promise<Response> {
  const actor = await routeActor();
  if (actor instanceof Response) return actor;
  const denied = requireRole(actor, "HR_ADMIN");
  if (denied) return denied;
  const input = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid workflow definition." }, { status: 400 });
  }
  if (parsed.data.fromTemplate && parsed.data.steps) {
    return Response.json({ ok: false, error: "Pass either fromTemplate or steps, not both.", code: "VALIDATION" }, { status: 400 });
  }
  try {
    const store = supabaseWorkflowStore();
    const drafts = await store.listWorkflows(actor.organizationId, { status: "draft", limit: 1 });
    if (drafts.total >= MAX_DRAFTS_PER_ORG) {
      return Response.json(
        { ok: false, error: `Draft limit reached (${MAX_DRAFTS_PER_ORG} per organization). Activate or delete a draft first.`, code: "DRAFT_CAP" },
        { status: 409 },
      );
    }
    let name = parsed.data.name ?? "Untitled workflow";
    let triggerType = parsed.data.triggerType;
    let triggerEvent: string | undefined = parsed.data.triggerEvent;
    let steps = parsed.data.steps;
    if (parsed.data.fromTemplate) {
      const built = instantiateTemplate(parsed.data.fromTemplate.templateId, parsed.data.fromTemplate.params);
      name = parsed.data.name ?? built.name;
      triggerType = built.triggerType;
      triggerEvent = built.triggerEvent;
      steps = built.steps;
    }
    if (triggerType === "event" && !triggerEvent) {
      throw new WorkflowDriveError("VALIDATION", "Event-triggered workflows require a trigger event.");
    }
    const workflow = await store.createWorkflow(
      actor.organizationId,
      { name, description: parsed.data.description, triggerType, triggerEvent, status: "draft" },
      actor.userId,
    );
    const version = steps ? await store.saveVersion(actor.organizationId, workflow.id, { steps }, actor.userId) : null;
    return Response.json({ ok: true, data: { ...workflow, version: version?.version ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
