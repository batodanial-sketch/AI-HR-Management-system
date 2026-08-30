"use client";

import { z } from "zod";

// Basic validation schema for AI-related inputs
const aiInputSchema = z.object({
  prompt: z.string().min(1).max(1000),
  context: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(1000),
  })).optional(),
});

export type AiInput = z.infer<typeof aiInputSchema>;

export function validateAiInput(input: unknown): AiInput {
  return aiInputSchema.parse(input);
}
