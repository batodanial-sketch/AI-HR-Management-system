/**
 * Grounded-answer envelope — KNOWN vs UNKNOWN, composed from retrieval.
 *
 * Retrieval can only ever assert KNOWN (a directly matching entry exists) or
 * UNKNOWN (nothing matches). INFERRED is deliberately NOT produced here:
 * inference is composed by the planner LLM at answer time, and the copilot
 * contract requires it to label inferred claims as such. This split keeps
 * each layer honest about what it knows.
 */

import type { KnowledgeHit } from "./search";

export type KnowledgeVerdict = "KNOWN" | "UNKNOWN";

export interface KnowledgeSource {
  id: string;
  title: string;
  excerpt: string;
  relevance: number;
  updatedAt: string;
  stale: boolean;
}

export interface GroundedAnswer {
  verdict: KnowledgeVerdict;
  query: string;
  /** Present only when verdict is KNOWN. */
  answer: string | null;
  sources: KnowledgeSource[];
  /** 0–1: top-hit relevance when KNOWN, 0 when UNKNOWN. */
  confidence: number;
  answeredAt: string;
  note: string;
}

/** Entries older than this are flagged stale (but still usable with the flag). */
export const KNOWLEDGE_STALE_DAYS = 365;

/** Minimum top-hit relevance to claim KNOWN. */
export const KNOWN_RELEVANCE_THRESHOLD = 0.34;

export function composeGroundedAnswer(query: string, hits: KnowledgeHit[], nowIso: string): GroundedAnswer {
  const sources: KnowledgeSource[] = hits.slice(0, 5).map((h) => ({
    id: h.id,
    title: h.title,
    excerpt: h.excerpt || h.content.slice(0, 240),
    relevance: h.relevance,
    updatedAt: h.updatedAt,
    stale: Date.parse(nowIso) - Date.parse(h.updatedAt) > KNOWLEDGE_STALE_DAYS * 86_400_000,
  }));
  const top = sources[0];
  if (!top || top.relevance < KNOWN_RELEVANCE_THRESHOLD) {
    return {
      verdict: "UNKNOWN",
      query,
      answer: null,
      sources: [],
      confidence: 0,
      answeredAt: nowIso,
      note: "No company-knowledge entry matches this question. The assistant must say it does not know rather than guess.",
    };
  }
  return {
    verdict: "KNOWN",
    query,
    answer: top.excerpt,
    sources,
    confidence: top.relevance,
    answeredAt: nowIso,
    note:
      "Answer grounded in the cited entries. Claims beyond the excerpts must be labeled INFERRED by the answering model.",
  };
}
