import "server-only";
import { evaluateCandidateSchema } from "@/lib/validations/ai";
import { bridgeUrl } from "@/lib/ai-proxy";

/**
 * Evaluates a candidate against a job using the AI engine
 * @param candidateId - UUID of the candidate
 * @param jobId - UUID of the job
 * @param context - Optional context for the evaluation
 * @returns Evaluation result from the AI engine
 */
export async function evaluateCandidate(
  candidateId: string,
  jobId: string,
  context?: Record<string, unknown>,
): Promise<unknown> {
  const validated = evaluateCandidateSchema.parse({ candidateId, jobId, context });

  // Call Python bridge for candidate evaluation
  const response = await fetch(`${bridgeUrl()}/api/ai/evaluate-candidate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateId: validated.candidateId, jobId: validated.jobId, context: validated.context }),
  });

  if (!response.ok) {
    throw new Error(`Candidate evaluation failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result;
}

/**
 * Calculates candidate-job fit score and recommendations
 * @param candidateData - Parsed candidate data from Supabase
 * @param jobData - Job requirements data
 * @param skills - Array of candidate skills
 * @returns Fit score (0-100), strengths, missing requirements, and recommendation
 */
export function calculateCandidateFit(
  candidateData: Record<string, unknown>,
  jobData: Record<string, unknown>,
  skills: string[],
): { score: number; strengths: string[]; missing: string[]; recommendation: string } {
  let score = 0;
  const strengths: string[] = [];
  const missing: string[] = [];

  // Experience matching (0-30 points)
  const candidateYears = (candidateData.experience_years as number) || 0;
  const requiredYears = (jobData.experience_required as number) || 0;
  if (candidateYears >= requiredYears) {
    score += 30;
    strengths.push("Meets or exceeds experience requirements");
  } else {
    missing.push(`Needs ${requiredYears - candidateYears} more years of experience`);
  }

  // Skills matching (0-40 points)
  const requiredSkills = (jobData.required_skills as string[]) || [];
  const matchedSkills = requiredSkills.filter(skill => skills.includes(skill));
  const matchPercentage = requiredSkills.length > 0 ? (matchedSkills.length / requiredSkills.length) * 100 : 0;
  const skillScore = Math.min(matchPercentage, 100);
  score += Math.round(skillScore * 0.4); // Max 40 points
  if (matchedSkills.length > 0) {
    strengths.push(`Matches ${matchedSkills.length}/${requiredSkills.length} required skills`);
  }
  if (skillScore < 100) {
    missing.push(`Missing ${requiredSkills.length - matchedSkills.length} required skills`);
  }

  // Education matching (0-15 points)
  const candidateEducation = (candidateData.education as string[]) || [];
  const requiredEducation = (jobData.education_required as string[]) || [];
  if (requiredEducation.length > 0) {
    const matches = requiredEducation.filter(edu => candidateEducation.some(c => c.toLowerCase().includes(edu.toLowerCase())));
    if (matches.length === requiredEducation.length) {
      score += 15;
      strengths.push("Meets all education requirements");
    } else {
      missing.push(`Missing ${requiredEducation.length - matches.length} education requirements`);
    }
  }

  // Company experience (0-10 points)
  const candidateCompanies = (candidateData.previous_companies as string[]) || [];
  const requiredCompanies = (jobData.preferred_companies as string[]) || [];
  if (requiredCompanies.length > 0) {
    const matches = requiredCompanies.filter(company => candidateCompanies.some(c => c.toLowerCase().includes(company.toLowerCase())));
    if (matches.length > 0) {
      score += Math.round((matches.length / requiredCompanies.length) * 10);
      strengths.push(`Experience with ${matches.length} preferred companies`);
    }
  }

  // Location preference (5 points)
  const candidateLocation = (candidateData.location as string) || "";
  const jobLocation = (jobData.location as string) || "";
  if (candidateLocation && jobLocation && candidateLocation.toLowerCase().includes(jobLocation.toLowerCase())) {
    score += 5;
    strengths.push("Location matches job requirements");
  }

  // Cap score at 100
  const finalScore = Math.min(score, 100);

  // Generate recommendation
  let recommendation = "Consider this candidate for interview.";
  if (finalScore >= 80) {
    recommendation = "Strong candidate - recommend moving to interview stage.";
  } else if (finalScore >= 60) {
    recommendation = "Good fit - consider for next round.";
  } else if (finalScore >= 40) {
    recommendation = "Potential candidate - review manually.";
  } else {
    recommendation = "Not a strong fit for this role.";
  }

  return { score: finalScore, strengths, missing, recommendation };
}

/**
 * Validates evaluation parameters
 * @param params - Parameters to validate
 * @returns Validated parameters
 */
export function validateEvaluateCandidateParams(
  params: unknown,
): { candidateId: string; jobId: string; context?: Record<string, unknown> } {
  return evaluateCandidateSchema.parse(params);
}

/**
 * Formats evaluation response for API
 * @param data - Raw evaluation result
 * @returns Formatted response
 */
export function formatEvaluateCandidateResponse(
  data: unknown,
): { success: boolean; data: unknown } {
  return { success: true, data };
}

/**
 * Handles evaluation errors
 * @param error - Caught error
 * @returns Error response
 */
export function handleEvaluateCandidateError(
  error: unknown,
): { success: boolean; error: string; status: number } {
  const message =
    error instanceof Error ? error.message : "Candidate evaluation failed.";
  return { success: false, error: message, status: 500 };
}