import { z } from "zod";
import { supabaseWorkflowStore } from "@/lib/workflows/store";
import { mapDriveError, routeActor } from "@/lib/workflows/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workflows/runs — list runs (any member, org-scoped, paginated). */
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
    const { rows, total } = await supabaseWorkflowStore().listRuns(actor.organizationId, parsed.data);
    return Response.json({ ok: true, data: rows, total }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapDriveError(error);
  }
}
