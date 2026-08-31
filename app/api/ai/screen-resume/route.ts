import { parseResumeSchema } from "@/lib/validations/ai";
import { evaluateCandidate, calculateCandidateFit } from "@/services/ai/evaluateCandidateService";
import { parseResume, storeParsedResume, formatResumeForStorage } from "@/services/ai/parseResumeService";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { proxyToBridge } from "@/lib/ai-proxy";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = await getOrganizationId();
    const body = await request.json();
    const parsedInput = parseResumeSchema.parse(body);

    // Step 1: Parse resume
    const parsedData = await parseResume(parsedInput);
    const resumeForStorage = formatResumeForStorage(parsedData);

    // Step 2: Store parsed resume
    await storeParsedResume(user.id, resumeForStorage, organizationId);

    // Step 3: Fetch matching job via bridge proxy
    const jobResponse = await proxyToBridge(request, "/api/ai/jobs");
    const jobs = await jobResponse.json();
    const activeJob = Array.isArray(jobs) ? jobs[0] : null;

    if (!activeJob) {
      return NextResponse.json(
        { error: "No active job posting found for evaluation" },
        { status: 404 }
      );
    }

    // Step 4: Evaluate candidate fit
    const resumeText = JSON.stringify(resumeForStorage);
    const fitScore = await calculateCandidateFit(resumeText, activeJob.description);
    const evaluation = await evaluateCandidate(resumeText, activeJob);

    // Step 5: Store evaluation entry
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/candidate_evaluations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        "Content-Type": "application/json",
        Prefer: "return=representation",
      } as Record<string, string>,
      body: JSON.stringify({
        candidate_id: user.id,
        job_id: activeJob.id,
        fit_score: fitScore,
        evaluation_data: evaluation,
      }),
    });

    return NextResponse.json({
      success: true,
      fitScore,
      evaluation,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process resume screening" },
      { status: 500 }
    );
  }
}
