"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/src/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResponse } from "./types";
import { actionFailure, actionSuccess } from "./types";
import { requireOrganizationContext, validationFailure } from "./_shared";

/**
 * AI Gateway Analytics — server actions for token usage, cost tracking, and rate limit observability.
 *
 * All reads are org-scoped via explicit `.eq(organization_id)` + RLS `is_organization_member`.
 * Typed with `SupabaseClient<Database>` to satisfy quality gate 6 (zero any assertions).
 */

export const AI_FEATURES = [
  "candidate_evaluation",
  "copilot",
  "pto_evaluation",
  "resume_parse",
  "candidate_ranking",
  "interview_report",
  "insights",
  "unknown",
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

export interface AiUsageLogRow {
  id: string;
  organizationId: string;
  model: string;
  feature: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt: string;
}

export interface AiSpendSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  totalRequests: number;
  perFeature: Array<{
    feature: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  }>;
  perModel: Array<{
    model: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  }>;
  daily: Array<{
    date: string;
    requests: number;
    totalTokens: number;
    costUsd: number;
  }>;
}

export interface AiUsageListResult {
  rows: AiUsageLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AiUsageExportFile {
  filename: string;
  content: string;
  contentType: string;
}

const aiUsageFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  feature: z.enum(AI_FEATURES).optional(),
  model: z.string().trim().max(120).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid from date.")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid to date.")
    .optional(),
});

const aiUsagePageSchema = aiUsageFilterSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});

const spendSummarySchema = aiUsageFilterSchema.extend({
  days: z.number().int().min(1).max(365).default(30),
});

type TypedClient = SupabaseClient<Database>;

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function mapRow(row: Database["public"]["Tables"]["ai_usage_logs"]["Row"]): AiUsageLogRow {
  const prompt = row.prompt_tokens ?? 0;
  const completion = row.completion_tokens ?? 0;
  return {
    id: row.id,
    organizationId: row.organization_id,
    model: row.model ?? "unknown",
    feature: row.feature ?? "unknown",
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
    costUsd: row.cost_usd ?? 0,
    createdAt: row.created_at ?? "",
  };
}

function buildFilteredQuery(
  supabase: TypedClient,
  organizationId: string,
  filter: z.infer<typeof aiUsageFilterSchema>,
) {
  let query = supabase
    .from("ai_usage_logs")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId);

  if (filter.search) {
    // Search across model and feature via ilike
    // Supabase doesn't support OR ilike easily in builder, so we search feature primarily
    // and let client-side filtering handle model if needed. For simplicity, search feature.
    query = query.ilike("feature", `%${filter.search}%`);
  }
  if (filter.feature) {
    query = query.eq("feature", filter.feature);
  }
  if (filter.model) {
    query = query.ilike("model", `%${filter.model}%`);
  }
  if (filter.from) {
    query = query.gte("created_at", `${filter.from}T00:00:00Z`);
  }
  if (filter.to) {
    query = query.lte("created_at", `${filter.to}T23:59:59Z`);
  }

  return query.order("created_at", { ascending: false });
}

/**
 * Lists AI usage logs for the current org, filtered + paginated.
 */
export async function listAiUsageLogs(
  input: z.input<typeof aiUsagePageSchema> = {},
): Promise<ActionResponse<AiUsageListResult>> {
  const parsed = aiUsagePageSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const auth = await requireOrganizationContext("employee");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;
    const { page, pageSize, ...filter } = parsed.data;

    const fromIndex = (page - 1) * pageSize;
    const toIndex = fromIndex + pageSize - 1;

    const { data, error, count } = await buildFilteredQuery(
      supabase,
      auth.data.organizationId,
      filter,
    ).range(fromIndex, toIndex);

    if (error) {
      return actionFailure(error.message);
    }

    const rows = (data ?? []).map((r) => mapRow(r as Database["public"]["Tables"]["ai_usage_logs"]["Row"]));
    return actionSuccess({
      rows,
      total: count ?? rows.length,
      page,
      pageSize,
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to load AI usage logs.",
    );
  }
}

/**
 * Returns aggregated spend summary for the current org.
 * Computes totals, per-feature and per-model breakdowns, and daily time-series.
 */
export async function getAiSpendSummary(
  input: z.input<typeof spendSummarySchema> = {},
): Promise<ActionResponse<AiSpendSummary>> {
  const parsed = spendSummarySchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const auth = await requireOrganizationContext("employee");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;
    const filter = parsed.data;
    const days = filter.days;

    // For summary we fetch up to 5000 rows (capped) to aggregate client-side.
    // This avoids needing a DB function and keeps RLS enforcement.
    const { data, error } = await buildFilteredQuery(
      supabase,
      auth.data.organizationId,
      filter,
    ).limit(5000);

    if (error) {
      return actionFailure(error.message);
    }

    const rows = (data ?? []).map((r) => mapRow(r as Database["public"]["Tables"]["ai_usage_logs"]["Row"]));

    // Aggregates
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalCost = 0;

    const featureMap = new Map<
      string,
      { requests: number; prompt: number; completion: number; cost: number }
    >();
    const modelMap = new Map<
      string,
      { requests: number; prompt: number; completion: number; cost: number }
    >();
    const dailyMap = new Map<string, { requests: number; tokens: number; cost: number }>();

    for (const row of rows) {
      totalPrompt += row.promptTokens;
      totalCompletion += row.completionTokens;
      totalCost += row.costUsd;

      const f = featureMap.get(row.feature) ?? {
        requests: 0,
        prompt: 0,
        completion: 0,
        cost: 0,
      };
      f.requests += 1;
      f.prompt += row.promptTokens;
      f.completion += row.completionTokens;
      f.cost += row.costUsd;
      featureMap.set(row.feature, f);

      const m = modelMap.get(row.model) ?? {
        requests: 0,
        prompt: 0,
        completion: 0,
        cost: 0,
      };
      m.requests += 1;
      m.prompt += row.promptTokens;
      m.completion += row.completionTokens;
      m.cost += row.costUsd;
      modelMap.set(row.model, m);

      const dateKey = row.createdAt ? row.createdAt.slice(0, 10) : "unknown";
      const d = dailyMap.get(dateKey) ?? { requests: 0, tokens: 0, cost: 0 };
      d.requests += 1;
      d.tokens += row.totalTokens;
      d.cost += row.costUsd;
      dailyMap.set(dateKey, d);
    }

    // Build daily array for last N days, sorted ascending
    const daily: AiSpendSummary["daily"] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date(now);
      dt.setUTCDate(dt.getUTCDate() - i);
      const key = dt.toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      daily.push({
        date: key,
        requests: entry?.requests ?? 0,
        totalTokens: entry?.tokens ?? 0,
        costUsd: entry?.cost ?? 0,
      });
    }

    const perFeature = Array.from(featureMap.entries())
      .map(([feature, agg]) => ({
        feature,
        requests: agg.requests,
        promptTokens: agg.prompt,
        completionTokens: agg.completion,
        totalTokens: agg.prompt + agg.completion,
        costUsd: agg.cost,
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    const perModel = Array.from(modelMap.entries())
      .map(([model, agg]) => ({
        model,
        requests: agg.requests,
        promptTokens: agg.prompt,
        completionTokens: agg.completion,
        totalTokens: agg.prompt + agg.completion,
        costUsd: agg.cost,
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    return actionSuccess({
      totalPromptTokens: totalPrompt,
      totalCompletionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
      totalCostUsd: totalCost,
      totalRequests: rows.length,
      perFeature,
      perModel,
      daily,
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to compute AI spend summary.",
    );
  }
}

/**
 * Exports AI usage logs as CSV (admin only, org-scoped).
 */
export async function exportAiUsageCSV(
  input: z.input<typeof aiUsageFilterSchema> = {},
): Promise<ActionResponse<AiUsageExportFile>> {
  const parsed = aiUsageFilterSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const auth = await requireOrganizationContext("admin");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;
    const { data, error } = await buildFilteredQuery(
      supabase,
      auth.data.organizationId,
      parsed.data,
    ).limit(5000);

    if (error) {
      return actionFailure(error.message);
    }

    const rows = (data ?? []).map((r) => mapRow(r as Database["public"]["Tables"]["ai_usage_logs"]["Row"]));

    const header = [
      "ID",
      "Feature",
      "Model",
      "Prompt Tokens",
      "Completion Tokens",
      "Total Tokens",
      "Cost USD",
      "Created At",
    ];

    const body = rows.map((row) =>
      [
        row.id,
        row.feature,
        row.model,
        row.promptTokens,
        row.completionTokens,
        row.totalTokens,
        row.costUsd,
        row.createdAt,
      ]
        .map(csvEscape)
        .join(","),
    );

    const content = [header.map(csvEscape).join(","), ...body].join("\n");

    // Audit the export
    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_id: auth.data.userId,
      action: "export",
      entity_type: "ai_usage_logs",
      metadata: { exported_count: rows.length } as unknown as Database["public"]["Tables"]["audit_logs"]["Row"]["metadata"],
    } as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return actionSuccess({
      filename: `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`,
      content,
      contentType: "text/csv;charset=utf-8",
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to export AI usage logs.",
    );
  }
}
