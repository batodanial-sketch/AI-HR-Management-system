import { z } from "zod";
import { requireKnowledgeWrite } from "@/lib/knowledge/handler";
import { createKnowledgeEntry, deleteKnowledgeEntry } from "@/lib/knowledge/store";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/knowledge — curated corpus management (HR_ADMIN+).
 * POST: create an entry. DELETE ?id=: remove an entry.
 */

const createSchema = z.object({
  title: z.string().min(2).max(240),
  content: z.string().min(10).max(20000),
  source: z.enum(["manual", "document", "policy", "faq"]).default("manual"),
  tags: z.array(z.string().min(1).max(80)).max(20).default([]),
});

export async function POST(request: Request): Promise<Response> {
  const gate = await requireKnowledgeWrite();
  if (gate instanceof Response) return gate;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join(" · ") },
      { status: 400 },
    );
  }
  const created = await createKnowledgeEntry(gate.organizationId, gate.user.id, parsed.data);
  if (!created) {
    return Response.json({ ok: false, error: "Knowledge store unavailable (Supabase unconfigured) or write rejected." }, { status: 503 });
  }
  await recordAuditLog({
    actorId: gate.user.id,
    actorType: "USER",
    action: "knowledge.create",
    targetModule: "knowledge",
    targetId: created.id,
    changes: { title: created.title },
    organizationId: gate.organizationId,
  });
  return Response.json({ ok: true, data: created }, { status: 201 });
}

export async function DELETE(request: Request): Promise<Response> {
  const gate = await requireKnowledgeWrite();
  if (gate instanceof Response) return gate;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return Response.json({ ok: false, error: "id: required" }, { status: 400 });
  }
  const ok = await deleteKnowledgeEntry(gate.organizationId, id);
  if (!ok) {
    return Response.json({ ok: false, error: "Entry not found or store unavailable." }, { status: 404 });
  }
  await recordAuditLog({
    actorId: gate.user.id,
    actorType: "USER",
    action: "knowledge.delete",
    targetModule: "knowledge",
    targetId: id,
    changes: {},
    organizationId: gate.organizationId,
  });
  return Response.json({ ok: true });
}
