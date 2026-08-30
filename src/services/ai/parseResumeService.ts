import "server-only";
import { parseResumeSchema } from "@/lib/validations/ai";
import { bridgeUrl, bridgeSecret } from "@/lib/ai-proxy";

/**
 * Parses a resume using the Python AI engine
 * @param fileBase64 - Base64 encoded file content
 * @param fileName - Original filename for context
 * @param metadata - Optional metadata for the resume
 * @returns Parsed resume data including skills, experience, education, companies
 */
export async function parseResume(
  fileBase64: string,
  fileName: string,
  metadata?: Record<string, unknown>,
): Promise<unknown> {
  const validated = parseResumeSchema.parse({ fileBase64, fileName, metadata });

  // Call Python bridge for resume parsing
  const response = await fetch(`${bridgeUrl()}/api/ai/parse-resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Secret": bridgeSecret(),
    },
    body: JSON.stringify({
      fileBase64: validated.fileBase64,
      fileName: validated.fileName,
      metadata: validated.metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resume parsing failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result;
}

/**
 * Validates resume parsing parameters
 * @param params - Parameters to validate
 * @returns Validated parameters
 */
export function validateParseResumeParams(
  params: unknown,
): { fileBase64: string; fileName: string; metadata?: Record<string, unknown> } {
  return parseResumeSchema.parse(params);
}

/**
 * Formats parsed resume data for storage
 * @param parsedData - Raw parsed resume data
 * @param candidateId - Candidate UUID
 * @returns Formatted resume attributes for Supabase storage
 */
export function formatResumeForStorage(
  parsedData: unknown,
  candidateId: string,
): Record<string, unknown> {
  // Extract structured data from AI parsing result
  let skills: string[] = [];
  let experience: number = 0;
  let education: string[] = [];
  let previousCompanies: string[] = [];
  let summary: string = "";
  let contact: Record<string, unknown> = {};

  // This would parse the actual AI response structure
  // For now, assume the AI returns a structured object
  if (typeof parsedData === "object" && parsedData !== null) {
    const data = parsedData as Record<string, unknown>;
    skills.push(...(data.skills as string[]) || []);
    experience = (data.yearsOfExperience as number) || 0;
    education = (data.education as string[]) || [];
    previousCompanies = (data.previousCompanies as string[]) || [];
    summary = (data.summary as string) || "";
    Object.assign(contact, data.contact || {});
  }

  return {
    skills,
    experience_years: experience,
    education,
    previous_companies: previousCompanies,
    summary,
    contact_info: contact,
    parsed_at: new Date().toISOString(),
    candidate_id: candidateId,
  };
}

/**
 * Stores parsed resume data in Supabase candidates table
 * @param candidateId - Candidate UUID
 * @param resumeData - Formatted resume data
 * @param organizationId - Organization ID for RLS
 */
export async function storeParsedResume(
  candidateId: string,
  resumeData: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/candidates`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({
      ...resumeData,
      organization_id: organizationId,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update candidate: ${response.status} ${response.statusText}`);
  }
}

/**
 * Handles resume parsing errors
 * @param error - Caught error
 * @returns Error response
 */
export function handleParseResumeError(
  error: unknown,
): { success: boolean; error: string; status: number } {
  const message =
    error instanceof Error ? error.message : "Resume parsing failed.";
  return { success: false, error: message, status: 500 };
}