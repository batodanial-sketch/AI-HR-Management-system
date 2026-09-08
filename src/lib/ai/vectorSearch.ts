import 'server-only'

/**
 * Calls the operator-configured semantic-search bridge
 * (PYTHON_SEMANTIC_SEARCH_URL). Used by the dormant /api/ai/semantic-search
 * and /api/ai/match-candidate routes; the bridge is an external service owned
 * by the operator, so the call is bounded and never leaks its URL in errors.
 */
export async function semanticSearchBridge(query: string, limit = 10) {
  const url = process.env.PYTHON_SEMANTIC_SEARCH_URL
  if (!url) throw new Error('PYTHON_SEMANTIC_SEARCH_URL is not configured.')
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
    cache: 'no-store',
    // Bounded: a wedged external search service must not pin server sockets.
    signal: AbortSignal.timeout(30_000),
  })
  if (!r.ok) throw new Error(`Semantic search bridge failed with ${r.status}.`)
  return r.json() as Promise<{ matches: Array<{ id: string; score: number; metadata: Record<string, unknown> }> }>
}
