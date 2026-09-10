import { z } from "zod";
import { matchCandidate } from "@/lib/recruitment/matching";
import { loadCandidateProfile, loadJobProfile } from "@/lib/recruitment/loader";
import { requireRecruitmentRole } from "@/lib/recruitment/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/recruitment/match — deterministic explainable candidate↔job match.
 *
 * Body: `{ candidateId, jobOpeningId }` (UUIDs). Loads both profiles
 * org-scoped, runs the pure matcher, and returns the full match envelope
 * (score, coverage, missing requirements, evidence, confidence, limitations,
 * advisory recommendation). HR_ADMIN+. Advisory only — never a decision.
 */

const bodySchema = z.object({
  candidateId: z.string().uuid(),
  jobOpeningId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  const gate = await requireRecruitmentRole();
  if (gate instanceof Response) return gate;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
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
    const [candidate, job] = await Promise.all([
      loadCandidateProfile(gate.organizationId, parsed.data.candidateId),
      loadJobProfile(gate.organizationId, parsed.data.jobOpeningId),
    ]);
    if (!candidate || !job) {
      return Response.json(
        { ok: false, error: "Candidate or job opening was not found in this organization, or recruitment matching is unavailable (Supabase unconfigured).", code: "MATCH_UNAVAILABLE" },
        { status: !candidate && !job ? 503 : 404 },
      );
    }
    return Response.json(
      {
        ok: true,
        match: matchCandidate(candidate, job),
        advisory: true,
        disclaimer: "Advisory match only — all hiring decisions require human review.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to compute match." },
      { status: 500 },
    );
  }
}
