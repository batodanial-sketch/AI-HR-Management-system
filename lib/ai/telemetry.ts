import "server-only";

import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";

/**
 * Copilot observability & token metering.
 *
 * `recordAiTelemetry` logs model latency, prompt/completion tokens and cost
 * per organization into the dedicated `ai_token_usage` table (migration
 * 20260830120000_ai_telemetry.sql), falling back to the legacy `ai_usage`
 * table when the new one is absent, and to stdout in demo mode. Never throws.
 *
 * Budget governance: `getAiBudget` / `setAiBudget` manage monthly caps, and
 * `checkAiBudget` decides whether a request may proceed, returns the
 * remaining headroom, and suggests a fallback model when limits approach —
 * the Copilot orchestrator routes accordingly.
 */

export type AiTelemetryFeature =
  | "copilot"
  | "candidate_evaluation"
  | "pto_evaluation"
  | "resume_parse"
  | "candidate_ranking"
  | "interview_report"
  | "insights";

export interface AiTelemetryInput {
  feature: AiTelemetryFeature;
  organizationId: string;
  model?: string | null;
  provider?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  costUsd?: number | null;
  status?: "ok" | "error" | "budget_blocked";
}

export interface AiBudgetSettings {
  organizationId: string;
  monthlyTokenCap: number | null;
  monthlyCostCapUsd: number | null;
  fallbackModel: string | null;
  fallbackProvider: string | null;
  enabled: boolean;
}

export interface AiUsageSummary {
  organizationId: string;
  monthStart: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  byFeature: Array<{ feature: string; requests: number; totalTokens: number; costUsd: number }>;
  byModel: Array<{ model: string; requests: number; totalTokens: number }>;
}

export interface AiBudgetDecision {
  allowed: boolean;
  threshold: "ok" | "warning" | "exceeded";
  remainingTokens: number | null;
  remainingCostUsd: number | null;
  fallbackModel: string | null;
  fallbackProvider: string | null;
}

/** Rough per-model USD pricing per 1M tokens (prompt, completion). */
const MODEL_PRICE_PER_MTOK: Record<string, [number, number]> = {
  "llama-3.3-70b-versatile": [0.59, 0.79],
  "llama-3.1-8b-instant": [0.05, 0.08],
  "llama-3.2-3b-preview": [0.06, 0.06],
  "mixtral-8x7b-32768": [0.24, 0.24],
  "deepseek-r1-distill-llama-70b": [0.75, 0.99],
  "qwen-2.5-32b": [0.79, 0.79],
  "gemma2-9b-it": [0.2, 0.2],
  "openai/gpt-oss-120b": [1.0, 3.0],
};
const DEFAULT_PRICE_PER_MTOK: [number, number] = [0.59, 0.79];

export function estimateCostUsd(model: string | null | undefined, promptTokens: number, completionTokens: number): number {
  const [inPrice, outPrice] = model ? (MODEL_PRICE_PER_MTOK[model] ?? DEFAULT_PRICE_PER_MTOK) : DEFAULT_PRICE_PER_MTOK;
  return (promptTokens / 1_000_000) * inPrice + (completionTokens / 1_000_000) * outPrice;
}

export async function recordAiTelemetry(input: AiTelemetryInput): Promise<void> {
  if (!hasSupabaseEnv()) {
    console.info(
      `[ai-telemetry] demo org=${input.organizationId || "unknown"} ${input.feature} ` +
        `model=${input.model ?? "?"} in=${input.promptTokens ?? 0} out=${input.completionTokens ?? 0} ` +
        `latency=${input.latencyMs ?? 0}ms cost=${input.costUsd ?? 0}`,
    );
    return;
  }
  if (!input.organizationId) return;

  const costUsd =
    input.costUsd != null && Number.isFinite(input.costUsd)
      ? input.costUsd
      : estimateCostUsd(input.model, input.promptTokens ?? 0, input.completionTokens ?? 0);

  try {
    const { error } = await serverClient().from("ai_token_usage" as never).insert({
      organization_id: input.organizationId,
      feature: input.feature,
      model: input.model ?? null,
      provider: input.provider ?? null,
      prompt_tokens: input.promptTokens ?? 0,
      completion_tokens: input.completionTokens ?? 0,
      latency_ms: input.latencyMs ?? null,
      cost_usd: costUsd,
      status: input.status ?? "ok",
    } as never);
    if (error) {
      console.error("[ai-telemetry] write failed:", error.message);
    }
  } catch {
    // Legacy fallback: the ai_usage table predates ai_token_usage.
    try {
      const { error } = await serverClient().from("ai_usage").insert({
        organization_id: input.organizationId,
        feature: input.feature,
        model: input.model ?? null,
        tokens_in: input.promptTokens ?? 0,
        tokens_out: input.completionTokens ?? 0,
      });
      if (error) {
        console.error("[ai-telemetry] legacy fallback write failed:", error.message);
      }
    } catch {
      // Silently drop — telemetry must never break the request.
    }
  }
}

function monthStartIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Current-month usage summary per organization. */
export async function getAiUsageSummary(organizationId: string): Promise<AiUsageSummary> {
  const empty: AiUsageSummary = {
    organizationId,
    monthStart: monthStartIso(),
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    byFeature: [],
    byModel: [],
  };
  if (!hasSupabaseEnv()) return empty;

  try {
    const { data, error } = await serverClient()
      .from("ai_token_usage" as never)
      .select("feature, model, prompt_tokens, completion_tokens, cost_usd")
      .eq("organization_id", organizationId)
      .gte("created_at", empty.monthStart);
    if (error) return empty;
    const rows = (data ?? []) as unknown as Array<{
      feature: string;
      model: string | null;
      prompt_tokens: number;
      completion_tokens: number;
      cost_usd: number;
    }>;

    const byFeature = new Map<string, { requests: number; totalTokens: number; costUsd: number }>();
    const byModel = new Map<string, { requests: number; totalTokens: number }>();
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;

    for (const row of rows) {
      const tokens = row.prompt_tokens + row.completion_tokens;
      promptTokens += row.prompt_tokens;
      completionTokens += row.completion_tokens;
      costUsd += Number(row.cost_usd) || 0;

      const feature = byFeature.get(row.feature) ?? { requests: 0, totalTokens: 0, costUsd: 0 };
      feature.requests += 1;
      feature.totalTokens += tokens;
      feature.costUsd += Number(row.cost_usd) || 0;
      byFeature.set(row.feature, feature);

      const modelKey = row.model ?? "unknown";
      const model = byModel.get(modelKey) ?? { requests: 0, totalTokens: 0 };
      model.requests += 1;
      model.totalTokens += tokens;
      byModel.set(modelKey, model);
    }

    return {
      organizationId,
      monthStart: empty.monthStart,
      requests: rows.length,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      byFeature: [...byFeature.entries()]
        .map(([feature, value]) => ({ feature, ...value }))
        .sort((a, b) => b.totalTokens - a.totalTokens),
      byModel: [...byModel.entries()]
        .map(([model, value]) => ({ model, ...value }))
        .sort((a, b) => b.totalTokens - a.totalTokens),
    };
  } catch {
    return empty;
  }
}

/** Reads the org's budget settings (env-backed defaults when unset). */
export async function getAiBudget(organizationId: string): Promise<AiBudgetSettings> {
  const defaults: AiBudgetSettings = {
    organizationId,
    monthlyTokenCap: Number(process.env.AI_DEFAULT_TOKEN_CAP ?? "10000000"),
    monthlyCostCapUsd: Number(process.env.AI_DEFAULT_COST_CAP_USD ?? "500"),
    fallbackModel: process.env.AI_FALLBACK_MODEL ?? "llama-3.1-8b-instant",
    fallbackProvider: process.env.AI_FALLBACK_PROVIDER ?? "groq",
    enabled: true,
  };
  if (!hasSupabaseEnv()) return defaults;

  const { data } = await serverClient()
    .from("ai_budget_settings" as never)
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return defaults;
  const row = data as unknown as {
    monthly_token_cap: string | number | null;
    monthly_cost_cap_usd: string | number | null;
    fallback_model: string | null;
    fallback_provider: string | null;
    enabled: boolean;
  };

  return {
    organizationId,
    monthlyTokenCap: row.monthly_token_cap ? Number(row.monthly_token_cap) : null,
    monthlyCostCapUsd: row.monthly_cost_cap_usd ? Number(row.monthly_cost_cap_usd) : null,
    fallbackModel: typeof row.fallback_model === "string" ? row.fallback_model : defaults.fallbackModel,
    fallbackProvider: typeof row.fallback_provider === "string" ? row.fallback_provider : defaults.fallbackProvider,
    enabled: row.enabled !== false,
  };
}

/** Upserts budget settings (caller must be HR_ADMIN+ — enforced by the route). */
export async function setAiBudget(
  organizationId: string,
  patch: {
    monthlyTokenCap?: number | null;
    monthlyCostCapUsd?: number | null;
    fallbackModel?: string | null;
    fallbackProvider?: string | null;
    enabled?: boolean;
  },
): Promise<AiBudgetSettings> {
  if (!hasSupabaseEnv()) {
    return getAiBudget(organizationId);
  }
  const { error } = await serverClient().from("ai_budget_settings" as never).upsert(
    {
      organization_id: organizationId,
      monthly_token_cap: patch.monthlyTokenCap ?? null,
      monthly_cost_cap_usd: patch.monthlyCostCapUsd ?? null,
      fallback_model: patch.fallbackModel ?? null,
      fallback_provider: patch.fallbackProvider ?? null,
      enabled: patch.enabled ?? true,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "organization_id" },
  );
  if (error) {
    throw new Error(`Unable to save AI budget settings: ${error.message}`);
  }
  return getAiBudget(organizationId);
}

/**
 * Decides whether a request may proceed against the org's monthly budget.
 * `warning` (>80% consumed) lets the orchestrator attach fallback hints;
 * `exceeded` blocks the call with a budget event.
 */
export async function checkAiBudget(
  organizationId: string,
  estimatedTokens = 0,
): Promise<AiBudgetDecision> {
  const [summary, budget] = await Promise.all([
    getAiUsageSummary(organizationId),
    getAiBudget(organizationId),
  ]);

  if (!budget.enabled) {
    return {
      allowed: true,
      threshold: "ok",
      remainingTokens: null,
      remainingCostUsd: null,
      fallbackModel: budget.fallbackModel,
      fallbackProvider: budget.fallbackProvider,
    };
  }

  const projectedTokens = summary.totalTokens + estimatedTokens;
  const tokenRemaining = budget.monthlyTokenCap === null ? null : budget.monthlyTokenCap - projectedTokens;
  const costRemaining = budget.monthlyCostCapUsd === null ? null : budget.monthlyCostCapUsd - summary.costUsd;

  let threshold: AiBudgetDecision["threshold"] = "ok";
  if (budget.monthlyTokenCap !== null && budget.monthlyTokenCap > 0) {
    const ratio = projectedTokens / budget.monthlyTokenCap;
    if (ratio >= 1) threshold = "exceeded";
    else if (ratio >= 0.8) threshold = "warning";
  }
  if (budget.monthlyCostCapUsd !== null && budget.monthlyCostCapUsd > 0) {
    const ratio = summary.costUsd / budget.monthlyCostCapUsd;
    if (ratio >= 1) threshold = "exceeded";
    else if (ratio >= 0.8 && threshold === "ok") threshold = "warning";
  }

  return {
    allowed: threshold !== "exceeded",
    threshold,
    remainingTokens: tokenRemaining !== null && tokenRemaining >= 0 ? tokenRemaining : null,
    remainingCostUsd: costRemaining !== null && costRemaining >= 0 ? costRemaining : null,
    fallbackModel: budget.fallbackModel,
    fallbackProvider: budget.fallbackProvider,
  };
}
