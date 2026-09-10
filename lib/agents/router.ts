/**
 * Agent router — deterministic intent classification (pure, no models).
 *
 * Maps the latest user message to one of the named agents by weighted
 * keyword scoring. Returned `reasons` name the matched signals so routing is
 * explainable; ties and low-confidence messages fall back to `general`
 * (fail-open to the broad agent, never to a wrong specialist — the tools
 * still enforce RBAC regardless).
 */

export type AgentId = "intelligence" | "recruitment" | "general";

export const AGENT_IDS: AgentId[] = ["intelligence", "recruitment", "general"];

export interface RouteDecision {
  agent: AgentId;
  /** 0–1 normalized score gap; < 0.15 means "weak signal, defaulted". */
  confidence: number;
  /** Matched keyword signals, e.g. ["keyword:turnover"]. */
  reasons: string[];
}

interface Signal {
  pattern: RegExp;
  weight: number;
  label: string;
}

const INTELLIGENCE_SIGNALS: Signal[] = [
  { pattern: /\bbriefing\b/, weight: 3, label: "briefing" },
  { pattern: /\bbrief me\b/, weight: 3, label: "brief me" },
  { pattern: /\bturnover\b/, weight: 3, label: "turnover" },
  { pattern: /\battrition\b/, weight: 3, label: "attrition" },
  { pattern: /\binsight(s)?\b/, weight: 2, label: "insight" },
  { pattern: /\btrend(s)?\b/, weight: 2, label: "trend" },
  { pattern: /\bheadcount\b/, weight: 2, label: "headcount" },
  { pattern: /\bworkforce\b/, weight: 2, label: "workforce" },
  { pattern: /\bforecast\b/, weight: 2, label: "forecast" },
  { pattern: /\banomal(y|ies)\b/, weight: 2, label: "anomaly" },
  { pattern: /\benps\b/, weight: 2, label: "enps" },
  { pattern: /\bengagement\b/, weight: 2, label: "engagement" },
  { pattern: /\bflight risk\b/, weight: 2, label: "flight risk" },
  { pattern: /\bhiring velocity\b/, weight: 2, label: "hiring velocity" },
  { pattern: /\bbottleneck(s)?\b/, weight: 2, label: "bottleneck" },
  { pattern: /\banalytics\b/, weight: 1, label: "analytics" },
  { pattern: /\breport\b/, weight: 1, label: "report" },
  { pattern: /\balert(s)?\b/, weight: 1, label: "alert" },
  { pattern: /\battendance\b/, weight: 1, label: "attendance" },
  { pattern: /\bleave\b/, weight: 1, label: "leave" },
];

const RECRUITMENT_SIGNALS: Signal[] = [
  { pattern: /\bcandidate(s)?\b/, weight: 3, label: "candidate" },
  { pattern: /\binterview(s|ing)?\b/, weight: 3, label: "interview" },
  { pattern: /\bhiring\b/, weight: 2, label: "hiring" },
  { pattern: /\bhire\b/, weight: 2, label: "hire" },
  { pattern: /\brecruit(ment|ing|er)?\b/, weight: 3, label: "recruit" },
  { pattern: /\bjob(s)?\b/, weight: 2, label: "job" },
  { pattern: /\bresume(s)?\b/, weight: 2, label: "resume" },
  { pattern: /\bcv\b/, weight: 1, label: "cv" },
  { pattern: /\bscreen(ing)?\b/, weight: 2, label: "screen" },
  { pattern: /\boffer(s)?\b/, weight: 2, label: "offer" },
  { pattern: /\bapplicant(s)?\b/, weight: 2, label: "applicant" },
  { pattern: /\btalent\b/, weight: 2, label: "talent" },
  { pattern: /\bshortlist\b/, weight: 2, label: "shortlist" },
  { pattern: /\bmatch\b/, weight: 1, label: "match" },
  { pattern: /\brank\b/, weight: 1, label: "rank" },
];

function scoreSignals(message: string, signals: Signal[]): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const signal of signals) {
    if (signal.pattern.test(message)) {
      score += signal.weight;
      reasons.push(`keyword:${signal.label}`);
    }
  }
  return { score, reasons };
}

/** Classifies a single user message. Pure and deterministic. */
export function classifyIntent(message: string): RouteDecision {
  const text = message.toLowerCase();
  const intel = scoreSignals(text, INTELLIGENCE_SIGNALS);
  const recruit = scoreSignals(text, RECRUITMENT_SIGNALS);

  if (intel.score === 0 && recruit.score === 0) {
    return { agent: "general", confidence: 0, reasons: [] };
  }
  if (intel.score === recruit.score) {
    // Tie (e.g. "hiring bottleneck") — the broader intelligence agent owns
    // cross-domain reads; recruitment tools stay one explicit request away.
    return {
      agent: "intelligence",
      confidence: 0.15,
      reasons: [...intel.reasons, ...recruit.reasons, "tie-break:intelligence"],
    };
  }
  const winner = intel.score > recruit.score ? { agent: "intelligence" as const, ...intel } : { agent: "recruitment" as const, ...recruit };
  const loser = intel.score > recruit.score ? recruit.score : intel.score;
  const total = intel.score + recruit.score;
  const confidence = total > 0 ? Math.round(((winner.score - loser) / (total + 2)) * 100) / 100 : 0;
  return { agent: winner.agent, confidence, reasons: winner.reasons };
}

/** Routes a conversation by its latest user message (empty → general). */
export function routeConversation(messages: Array<{ role: string; content: string }>): RouteDecision {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return { agent: "general", confidence: 0, reasons: [] };
  return classifyIntent(lastUser.content);
}
