import { z } from "zod";
import { getCandidates } from "@/lib/api";
import { requireRecruitmentRole } from "@/lib/recruitment/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/candidates — bounded candidate search (brief §7).
 *
 * Query params: `query` (substring over name/tags/stage/location/source/role),
 * `stage` (exact stage), `limit` (1–50, default 20).
 *
 * HR_ADMIN+ only. Returns a MINIMAL projection — contact and document fields
 * (email, phone, resume/linkedin/portfolio URLs) are deliberately excluded;
 * the authorized contact workflow lives in the recruitment server actions.
 */

const querySchema = z.object({
  query: z.string().max(200).optional(),
  stage: z
    .enum(["applied", "screening", "shortlisted", "interview", "offer", "hired", "rejected", "withdrawn"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request): Promise<Response> {
  const gate = await requireRecruitmentRole();
  if (gate instanceof Response) return gate;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
    stage: url.searchParams.get("stage") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join(" · "),
      },
      { status: 400 },
    );
  }

  try {
    const candidates = await getCandidates();
    const needle = parsed.data.query?.trim().toLowerCase() ?? "";
    const filtered = candidates.filter((c) => {
      if (parsed.data.stage && c.stage !== parsed.data.stage) return false;
      if (!needle) return true;
      const haystack = [
        c.firstName,
        c.lastName,
        `${c.firstName} ${c.lastName}`,
        c.role,
        c.stage,
        c.source,
        c.location ?? "",
        ...(c.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return needle.split(/\s+/).every((token) => haystack.includes(token));
    });

    const data = filtered.slice(0, parsed.data.limit).map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      role: c.role,
      jobPostingId: c.jobPostingId,
      stage: c.stage,
      matchScore: c.matchScore,
      source: c.source,
      location: c.location ?? null,
      tags: c.tags ?? [],
    }));
    return Response.json(
      { ok: true, data, count: data.length, total: filtered.length, scope: gate.scope },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to search candidates." },
      { status: 500 },
    );
  }
}
