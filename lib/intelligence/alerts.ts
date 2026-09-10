/**
 * Proactive alerts — pure derivation over an insight set.
 *
 * Every warning/critical insight with sufficient data becomes exactly one
 * alert. The alert id IS the insight id, which is stable per rule+scope —
 * consumers deduplicate by id, so re-runs never double-notify for the same
 * finding. Status is always "open" in v1: acknowledgement persistence is an
 * explicit P1 follow-up (see gap matrix), and this module never pretends a
 * stored state exists.
 */

import type { Insight, InsightCategory, InsightScope, InsightSeverity } from "./types";

export type AlertStatus = "open";

export interface Alert {
  /** Stable dedup key — equals the source insight id. */
  id: string;
  category: InsightCategory;
  severity: Exclude<InsightSeverity, "info">;
  title: string;
  evidence: string[];
  timestamp: string;
  status: AlertStatus;
  scope: InsightScope;
  recommendedAction: string;
  actionDetail: string;
  requiresApproval: boolean;
  href?: string;
  confidence: number;
}

export function deriveAlerts(insights: Insight[], generatedAt: string): Alert[] {
  return insights
    .filter((i): i is Insight & { severity: Exclude<InsightSeverity, "info"> } => !i.insufficientData && i.severity !== "info")
    .map((i) => ({
      id: i.id,
      category: i.category,
      severity: i.severity,
      title: i.title,
      evidence: i.evidence,
      timestamp: generatedAt,
      status: "open" as const,
      scope: i.scope,
      recommendedAction: i.recommendedAction.label,
      actionDetail: i.recommendedAction.detail,
      requiresApproval: i.recommendedAction.requiresApproval,
      href: i.recommendedAction.href,
      confidence: i.confidence,
    }));
}
