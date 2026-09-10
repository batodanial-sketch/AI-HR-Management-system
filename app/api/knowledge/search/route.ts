import { z } from "zod";
import { composeGroundedAnswer } from "@/lib/knowledge/answer";
import { requireKnowledgeRead } from "@/lib/knowledge/handler";
import { searchKnowledge } from "@/lib/knowledge/search";
import { listKnowledgeEntries } from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge/search — ranked company-knowledge retrieval + grounded
 * answer envelope (KNOWN with cited sources, or explicit UNKNOWN).
 * Any authenticated member. Read-only.
 */

const querySchema = z.object({
  q: z.string().min(2).max(500),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export async function GET(request: Request): Promise<Response> {
  const gate = await requireKnowledgeRead();
  if (gate instanceof Response) return gate;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join(" · ") },
      { status: 400 },
    );
  }

  try {
    const entries = await listKnowledgeEntries(gate.organizationId);
    const hits = searchKnowledge(entries, parsed.data.q, parsed.data.limit);
    const now = new Date().toISOString();
    return Response.json(
      { ok: true, answer: composeGroundedAnswer(parsed.data.q, hits, now), hits, count: hits.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to search knowledge." },
      { status: 500 },
    );
  }
}
