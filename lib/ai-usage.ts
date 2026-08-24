import "server-only";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * AI usage metering — records each AI feature invocation (and token counts
 * when available) to the `ai_usage` table. Lets enterprise buyers see their
 * BYOK spend per feature in the admin console.
 */

export type AiFeature =
  | "candidate_evaluation"
  | "copilot"
  | "pto_evaluation"
  | "resume_parse"
  | "candidate_ranking"
  | "interview_report"
  | "insights";

export async function recordAiUsage(input: {
  feature: AiFeature;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
}): Promise<void> {
  if (!hasSupabaseEnv()) {
    return;
  }
  const user = await getCurrentUser();
  if (!user.organizationId) {
    return;
  }
  const { error } = await serverClient().from("ai_usage").insert({
    organization_id: user.organizationId,
    feature: input.feature,
    model: input.model ?? null,
    tokens_in: input.tokensIn ?? 0,
    tokens_out: input.tokensOut ?? 0,
  });
  if (error) {
    console.error("[ai-usage] write failed:", error.message);
  }
}
