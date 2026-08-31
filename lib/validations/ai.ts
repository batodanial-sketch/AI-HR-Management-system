import { z } from "zod";

export const recruiterOutreachSchema = z.object({
  candidateId: z.string(),
  jobId: z.string().optional(),
  context: z.string().optional(),
  tone: z.string().optional(),
  action: z.string().optional(),
  subject: z.string().optional(),
  template: z.string().optional(),
  message: z.string().optional(),
});
export const parseResumeSchema = z.object({ fileUrl: z.string().optional(), text: z.string().optional() });
export const enrollOutreachSchema = z.object({
  candidateId: z.string(),
  jobId: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  suggestedFollowUpDays: z.number().optional(),
  tone: z.string().optional(),
  action: z.string().optional(),
  context: z.string().optional(),
});
