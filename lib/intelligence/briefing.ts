/**
 * HR briefing composer — pure function over an insight set.
 *
 * Turns ranked insights into the Daily HR Briefing shape: Attention Required
 * (critical/warning findings), Positive Signals (tone-positive findings),
 * and Recommended Actions (one entry per actionable insight, each carrying
 * why + evidence + expected impact + confidence + approval requirement).
 *
 * No model calls: expected impact reuses each signal's own statement of what
 * the action achieves (`recommendedAction.detail`), so the briefing can never
 * promise an outcome no rule asserted.
 */

import type { Insight, InsightCategory } from "./types";

export interface BriefingRecommendation {
  insightId: string;
  category: InsightCategory;
  action: string;
  why: string;
  evidence: string[];
  expectedImpact: string;
  confidence: number;
  requiresApproval: boolean;
  href?: string;
}

export interface HrBriefing {
  generatedAt: string;
  /** Critical + warning insights with sufficient data, most severe first. */
  attention: Insight[];
  /** Tone-positive insights with sufficient data. */
  positive: Insight[];
  /** One entry per actionable (non-insufficient) warning/critical insight. */
  recommended: BriefingRecommendation[];
  /** Categories that reported insufficient data (explicit gaps, not silence). */
  insufficient: InsightCategory[];
  counts: { attention: number; positive: number; recommended: number; insufficient: number };
}

export function composeBriefing(insights: Insight[], generatedAt: string): HrBriefing {
  const usable = insights.filter((i) => !i.insufficientData);
  const attention = usable.filter((i) => i.severity !== "info");
  const positive = usable.filter((i) => i.tone === "positive");
  const recommended: BriefingRecommendation[] = attention.map((i) => ({
    insightId: i.id,
    category: i.category,
    action: i.recommendedAction.label,
    why: i.explanation,
    evidence: i.evidence,
    expectedImpact: i.recommendedAction.detail,
    confidence: i.confidence,
    requiresApproval: i.recommendedAction.requiresApproval,
    href: i.recommendedAction.href,
  }));
  const insufficient = [...new Set(insights.filter((i) => i.insufficientData).map((i) => i.category))].sort();

  return {
    generatedAt,
    attention,
    positive,
    recommended,
    insufficient,
    counts: {
      attention: attention.length,
      positive: positive.length,
      recommended: recommended.length,
      insufficient: insufficient.length,
    },
  };
}
