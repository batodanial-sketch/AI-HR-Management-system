/**
 * Company-knowledge keyword retrieval — pure ranking over rows.
 *
 * Scores title (×3), tags (×2) and content (×1) token overlap, normalized to
 * 0–1 relevance. This is honest keyword relevance, not embedding similarity:
 * the module never claims semantic understanding it does not have. Vector
 * search is an explicit future upgrade (see migration notes).
 */

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: string;
  tags: string[];
  updatedAt: string;
}

export interface KnowledgeHit extends KnowledgeEntry {
  /** 0–1 normalized keyword relevance. */
  relevance: number;
  /** Short excerpt around the first content match (empty when title/tags only). */
  excerpt: string;
  matchedTerms: string[];
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

export function searchKnowledge(entries: KnowledgeEntry[], query: string, limit = 10): KnowledgeHit[] {
  const terms = [...new Set(tokens(query))];
  if (terms.length === 0) return [];
  const capped = Math.min(Math.max(limit, 1), 25);

  const hits: KnowledgeHit[] = [];
  for (const entry of entries) {
    const titleTokens = new Set(tokens(entry.title));
    const tagTokens = new Set(entry.tags.flatMap(tokens));
    const contentTokens = tokens(entry.content);
    const contentSet = new Set(contentTokens);

    let raw = 0;
    const matched: string[] = [];
    for (const term of terms) {
      let termScore = 0;
      if (titleTokens.has(term)) termScore += 3;
      if (tagTokens.has(term)) termScore += 2;
      if (contentSet.has(term)) termScore += 1;
      if (termScore > 0) {
        raw += termScore;
        matched.push(term);
      }
    }
    if (raw === 0) continue;
    const relevance = Math.min(1, Math.round((raw / (terms.length * 3)) * 100) / 100);

    let excerpt = "";
    const firstHit = contentTokens.findIndex((t) => matched.includes(t));
    if (firstHit >= 0) {
      const words = entry.content.split(/\s+/);
      // Map token index back approximately: find the word containing the term.
      const wordIdx = words.findIndex((w) => w.toLowerCase().includes(matched[0]));
      const start = Math.max(0, wordIdx - 8);
      excerpt = (start > 0 ? "… " : "") + words.slice(start, start + 24).join(" ") + (start + 24 < words.length ? " …" : "");
    }

    hits.push({ ...entry, relevance, excerpt, matchedTerms: matched });
  }

  return hits.sort((a, b) => b.relevance - a.relevance || (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, capped);
}
