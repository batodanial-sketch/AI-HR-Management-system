/**
 * Workforce intelligence — shared envelope types (client-safe: no I/O).
 *
 * Every insight produced by `lib/intelligence/signals.ts` carries the full
 * envelope so UI, agents and briefings can render What / Why / Evidence /
 * Confidence / Limitations / Action without guessing. Nothing here is
 * model-generated: severities, confidences and thresholds are deterministic
 * rules documented next to each signal.
 */

/** Stable signal families. New families extend this union (never rename). */
export type InsightCategory =
  | "attendance"
  | "leave"
  | "recruitment"
  | "headcount"
  | "performance"
  | "expenses"
  | "engagement"
  | "offboarding"
  | "documents"
  | "workflows"
  | "onboarding";

export type InsightSeverity = "info" | "warning" | "critical";

/** Who/what the insight is about. Labels are human-readable, never raw ids. */
export interface InsightScope {
  type: "org" | "department" | "employee" | "job" | "candidate" | "document" | "workflow";
  /** Display label, e.g. "Engineering" or "Amara Okafor". */
  label: string;
  /** Stable identifier when the scope refers to a record (omitted for org). */
  ref?: string;
}

export interface InsightFreshness {
  /** ISO timestamp the underlying data was read. */
  asOf: string;
  /** Where the data came from, e.g. "attendance_records". */
  source: string;
  /** True when the source fell back to demo seed data. */
  seedFallback?: boolean;
}

export interface InsightAction {
  /** Short imperative label, e.g. "Review pending leave". */
  label: string;
  /** One sentence on what doing it achieves. */
  detail: string;
  /** True when a human must approve before the action runs (always true for consequential actions). */
  requiresApproval: boolean;
  /** Deep link inside the app when one exists (never an external URL). */
  href?: string;
}

export interface Insight {
  /** Stable id: `<category>:<rule>` (+ scope ref when scoped). */
  id: string;
  category: InsightCategory;
  /** One-line finding. */
  title: string;
  /** 1–2 sentence grounded detail. Never contains data not present in `evidence`. */
  detail: string;
  severity: InsightSeverity;
  /** 0–1 calibrated rule confidence (documented per signal, not a guess). */
  confidence: number;
  /** Machine-checkable facts, each phrased as "metric = value (context)". */
  evidence: string[];
  scope: InsightScope;
  freshness: InsightFreshness;
  /** Why this matters — the causal read, kept strictly inside the evidence. */
  explanation: string;
  /** What is missing that would raise confidence (empty when complete). */
  limitations: string[];
  recommendedAction: InsightAction;
  /**
   * True when the signal fired on too little data to trust. The insight is
   * still emitted (so empty states are explicit) but MUST render as
   * "insufficient data", never as a confident finding.
   */
  insufficientData: boolean;
  /**
   * Editorial tone for briefings: "positive" insights render under Positive
   * Signals; everything else renders by severity. Defaults to "concern".
   */
  tone?: "positive" | "concern";
}

/**
 * Sentinel detail text for insufficient-data insights. Renderers key off
 * `insufficientData === true`; the text keeps API consumers honest too.
 */
export const INSUFFICIENT_DATA = "INSUFFICIENT_DATA";

/** Severity rank for deterministic sorting (critical first). */
export const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Sorts most-actionable first: severity, then confidence, then id. */
export function sortInsights(insights: Insight[]): Insight[] {
  return [...insights].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.confidence - a.confidence ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
