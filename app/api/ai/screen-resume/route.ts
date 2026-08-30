import { proxyToBridge } from "@/lib/ai-proxy";
import { z } from "zod";
import { parseResumeSchema } from "@/lib/validations/ai";
import { evaluateCandidate, calculateCandidateFit, formatEvaluateCandidateResponse, handleEvaluateCandidateError } from "@/services/ai/evaluateCandidateService";
import { parseResume, storeParsedResume, formatResumeForStorage } from "@/services/ai/parseResumeService";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parseResult = parseResumeSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: parseResult.error.format() }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { fileBase64, fileName, metadata } = parseResult.data;

    // Get current user and organization context
    const user = await getCurrentUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const organizationId = getOrganizationId(user);
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Organization context required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 1: Parse the resume using AI bridge
    const parseResponse = await parseResume(fileBase64, fileName, metadata);
    const parsedData = parseResponse as Record<string, unknown>;

    // Step 2: Store parsed resume data in Supabase candidates table
    const resumeForStorage = formatResumeForStorage(parsedData, user.id);
    await storeParsedResume(user.id, resumeForStorage, organizationId);

    // Step 3: Find matching job for this candidate
    const jobResponse = await proxyToBridge(request, "/api/ai/jobs", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!jobResponse.ok) {
      throw new Error("Failed to fetch matching jobs");
    }
    const jobs = await jobResponse.json();

    // Step 4: Evaluate candidate against each job
    const evaluations: Record<string, unknown>[] = [];
    for (const job of jobs) {
      const fit = calculateCandidateFit(
        resumeForStorage,
        job,
        parsedData.skills as string[],
      );
      evaluations.push({
        jobId: job.id,
        score: fit.score,
        strengths: fit.strengths,
        missing: fit.missing,
        recommendation: fit.recommendation,
      });
    }

    // Step 5: Store evaluations in Supabase
    for (const evaluation of evaluations) {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/candidate_evaluations`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify({
          candidate_id: user.id,
          job_id: evaluation.jobId,
          score: evaluation.score,
          strengths: evaluation.strengths,
          missing_requirements: evaluation.missing,
          recommendation: evaluation.recommendation,
          evaluated_at: new Date().toISOString(),
          organization_id: organizationId,
        }),
      });
    }

    // Step 6: Return consolidated results
    const response = {
      success: true,
      data: {
        parsedResume: resumeForStorage,
        evaluations,
      },
    };

    return Response.json(response);
  } catch (e) {
    const errorResponse = handleEvaluateCandidateError(e);
    return Response.json(errorResponse, {
      status: errorResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}