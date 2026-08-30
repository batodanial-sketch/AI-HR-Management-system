import { z } from "zod";

/**
 * Validation schemas for AI endpoints.
 * These schemas are used to validate and sanitize incoming request bodies
 * before forwarding them to the Python AI bridge or external AI providers.
 */

// Common schemas
const IdSchema = z.string().uuid();
const OrganizationIdSchema = z.string().uuid();
const UserIdSchema = z.string().uuid();

// Parse Resume endpoint
const parseResumeSchema = z.object({
  file: z.instanceof(File).optional(), // Note: In Next.js API routes, File objects are not directly available; we might get a base64 string or buffer.
  // Since we are receiving a JSON body, we expect the file to be passed as a base64 string or a buffer.
  // We'll adjust based on actual usage. For now, we accept a string (base64) or a Buffer (represented as string in JSON?).
  // We'll change to accept a string and let the bridge handle the decoding.
  fileBase64: z.string().optional(),
  fileName: z.string().optional(),
  // Optional metadata
    metadata: z.record(z.string(), z.unknown()).optional(),
});

// Rank Candidates endpoint
const rankCandidatesSchema = z.object({
  jobId: IdSchema,
  candidateIds: z.array(IdSchema),
  // Optional criteria
    criteria: z.record(z.string(), z.unknown()).optional(),
});

// Match Candidate endpoint
const matchCandidateSchema = z.object({
  candidateId: IdSchema,
  jobIds: z.array(IdSchema),
  // Optional threshold
  threshold: z.number().min(0).max(1).optional(),
});

// Evaluate Candidate endpoint
const evaluateCandidateSchema = z.object({
  candidateId: IdSchema,
  jobId: IdSchema,
  // Optional context
  context: z.record(z.string(), z.unknown()).optional(),
});

// Evaluate PTO endpoint
const evaluatePtoSchema = z.object({
  employeeId: IdSchema,
  ptoDays: z.number().int().nonnegative(),
  // Optional reason
  reason: z.string().optional(),
});

// Interview Report endpoint
const interviewReportSchema = z.object({
  interviewId: IdSchema,
  // Optional format
  format: z.enum(["pdf", "docx", "html"]).optional(),
});

// Insights endpoint
const insightsSchema = z.object({
  // Optional filters
    filters: z.record(z.string(), z.unknown()).optional(),
  // Optional time range
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }).optional(),
});

// Semantic Search endpoint
export const semanticSearchSchema = z.object({
  query: z.string().min(1),
  // Optional filters
    filters: z.record(z.string(), z.unknown()).optional(),
  // Optional limit
  limit: z.number().int().nonnegative().max(100).optional(),
});

// AI Copilot endpoint (general)
const copilotSchema = z.object({
  prompt: z.string().min(1),
  // Optional context
  context: z.record(z.string(), z.unknown()).optional(),
  // Optional temperature
  temperature: z.number().min(0).max(2).optional(),
  // Optional max tokens
  maxTokens: z.number().int().nonnegative().optional(),
});

// Admin Copilot endpoint
const adminCopilotSchema = z.object({
  prompt: z.string().min(1),
  // Optional context
  context: z.record(z.string(), z.unknown()).optional(),
  // Optional temperature
  temperature: z.number().min(0).max(2).optional(),
  // Optional max tokens
  maxTokens: z.number().int().nonnegative().optional(),
});

// AI Test endpoint
const aiTestSchema = z.object({
  // Optional test parameters
    params: z.record(z.string(), z.unknown()).optional(),
});

// AI Test Connection endpoint
const aiTestConnectionSchema = z.object({
  // Optional connection parameters
    params: z.record(z.string(), z.unknown()).optional(),
});

// AI Engine endpoint (generic path)
const aiEngineSchema = z.object({
  // The engine endpoint is generic and expects a path and body.
  // We'll validate the body as a generic object for now.
  body: z.record(z.unknown()),
});

// Recruiter Outreach endpoint schema
export const recruiterOutreachSchema = z.object({
  // Candidate to contact
  candidateId: IdSchema,
  // Job requisition to fill
  jobId: IdSchema,
  // Optional context for personalization (company info, role details, etc.)
  context: z.record(z.string(), z.unknown()).optional(),
  // Outreach tone: formal, direct, startup-casual
  tone: z.enum(["formal", "direct", "startup-casual"]).default("formal"),
  // Action type: initial pitch, screening invitation, rejection
  action: z.enum(["initial pitch", "screening invitation", "rejection"]),
  // Optional custom subject line (overrides auto-generated)
  subject: z.string().optional(),
  // Optional custom message template (overrides auto-generated)
  template: z.string().optional(),
});

// Type for the schema union
export const enrollOutreachSchema = z.object({
  candidateId: IdSchema,
  jobId: IdSchema,
  // Initial subject and body for the first outreach step
  subject: z.string().min(1),
  body: z.string().min(1),
  // Array of suggested follow-up delays in days (e.g., [0, 3, 7])
  suggestedFollowUpDays: z.array(z.number().int().nonnegative()),
  // Tone and action for the initial outreach
  tone: z.enum(["formal", "direct", "startup-casual"]).default("formal"),
  action: z.enum(["initial pitch", "screening invitation", "rejection"]),
  // Optional custom context for template interpolation
  context: z.record(z.string(), z.unknown()).optional(),
});

// Export all schemas
export const aiSchemas = {
  "parse-resume": parseResumeSchema,
  "rank-candidates": rankCandidatesSchema,
  "match-candidate": matchCandidateSchema,
  "evaluate-candidate": evaluateCandidateSchema,
  "evaluate-pto": evaluatePtoSchema,
  "interview-report": interviewReportSchema,
  "insights": insightsSchema,
  "semantic-search": semanticSearchSchema,
  copilot: copilotSchema,
  "admin-copilot": adminCopilotSchema,
  test: aiTestSchema,
  "test-connection": aiTestConnectionSchema,
  engine: aiEngineSchema,
  "recruiter-outreach": recruiterOutreachSchema,
  "enroll-outreach": enrollOutreachSchema,
} as const;

// Type for the schema union
export type AiSchemaKey = keyof typeof aiSchemas;
export type EnrollOutreachPayload = z.infer<typeof enrollOutreachSchema>;