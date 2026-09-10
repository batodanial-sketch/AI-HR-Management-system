import "server-only";

/**
 * Global search dispatcher (command palette / command center).
 *
 * Fans out one query to the existing RBAC-guarded list routes with the
 * caller's session cookie forwarded — the SAME pattern as copilot tool
 * execution (`executeCopilotTool`). Each sub-route re-resolves the user and
 * enforces its own RBAC + tenant scoping, so global search can never return
 * a record the caller could not open directly. Denied/failing sources are
 * silently dropped from results (their status is reported, their data is
 * not).
 *
 * Sources (v1): employees, candidates, documents, knowledge. Leave has no
 * list route yet, so it is intentionally out of scope until one exists.
 */

export type SearchSourceKey = "employees" | "candidates" | "documents" | "knowledge";

export interface SearchResult {
  source: SearchSourceKey;
  id: string;
  title: string;
  subtitle: string;
  /** Null when there is no destination page (knowledge answers inline). */
  href: string | null;
  excerpt?: string;
  score: number;
}

export type SourceStatus = "ok" | "denied" | "error";

export interface SearchDispatchOutcome {
  results: SearchResult[];
  sources: Record<SearchSourceKey, SourceStatus>;
}

/** Deterministic tie-break order when scores are equal. */
const SOURCE_PRIORITY: SearchSourceKey[] = ["employees", "candidates", "knowledge", "documents"];

/** Upper bound on rows scanned per in-dispatcher filter (fetch-all sources). */
const MAX_SCAN_ROWS = 500;

const FETCH_TIMEOUT_MS = 8_000;

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function tokenizeSearchQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 8);
}

/** AND semantics: every token must appear in the haystack (mirrors /api/candidates). */
function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  const hay = haystack.toLowerCase();
  return tokens.length > 0 && tokens.every((token) => hay.includes(token));
}

function scorePick(title: string, subtitle: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const titleLower = title.toLowerCase();
  const subtitleLower = subtitle.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (titleLower.includes(token)) hits += 3;
    else if (subtitleLower.includes(token)) hits += 1;
  }
  return Math.min(1, hits / (tokens.length * 3));
}

function rowText(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

export interface EmployeeDirectoryLike {
  employee?: Record<string, unknown> | null;
  department?: Record<string, unknown> | null;
  jobTitle?: Record<string, unknown> | null;
}

/** Normalizes + filters one employees-list payload. Pure — unit tested. */
export function pickEmployees(data: unknown, tokens: string[]): Omit<SearchResult, "source" | "score">[] {
  const rows = (data as { data?: unknown[] } | unknown[]) ?? [];
  const list = Array.isArray(rows) ? rows : Array.isArray((rows as { data?: unknown }).data) ? (rows as { data: unknown[] }).data : [];
  const picks: Omit<SearchResult, "source" | "score">[] = [];
  for (const row of list.slice(0, MAX_SCAN_ROWS)) {
    const record = (row ?? {}) as EmployeeDirectoryLike;
    const employee = (record.employee ?? {}) as Record<string, unknown>;
    const firstName = rowText(employee, "first_name", "firstName");
    const lastName = rowText(employee, "last_name", "lastName");
    if (!firstName && !lastName) continue;
    const title = `${firstName} ${lastName}`.trim();
    const jobTitle = record.jobTitle ? rowText(record.jobTitle as Record<string, unknown>, "title", "name") : "";
    const department = record.department
      ? rowText(record.department as Record<string, unknown>, "name", "title")
      : "";
    const subtitle = [jobTitle || rowText(employee, "title"), department || rowText(employee, "department")]
      .filter(Boolean)
      .join(" · ");
    if (!matchesAllTokens(`${title} ${subtitle} ${rowText(employee, "work_email", "email")}`, tokens)) continue;
    const id = rowText(employee, "id");
    if (!id) continue;
    picks.push({ id, title, subtitle, href: `/employees/${id}` });
  }
  return picks;
}

export interface CandidateLike {
  id?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  role?: unknown;
  stage?: unknown;
}

/** Normalizes one candidates-list payload (route already filtered server-side). Pure. */
export function pickCandidates(data: unknown): Omit<SearchResult, "source" | "score">[] {
  const list = (data as { data?: CandidateLike[] })?.data;
  if (!Array.isArray(list)) return [];
  const picks: Omit<SearchResult, "source" | "score">[] = [];
  for (const candidate of list.slice(0, MAX_SCAN_ROWS)) {
    const id = text(candidate.id);
    if (!id) continue;
    const title = `${text(candidate.firstName)} ${text(candidate.lastName)}`.trim() || "Candidate";
    // Stage + role only — never email/phone (the route projection excludes PII too).
    const subtitle = [text(candidate.role), text(candidate.stage)].filter(Boolean).join(" · ");
    picks.push({ id, title, subtitle, href: "/recruitment" });
  }
  return picks;
}

export interface DocumentLike {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  kind?: unknown;
  category?: unknown;
  owner?: unknown;
}

/** Normalizes + filters one documents-list payload. Pure — unit tested. */
export function pickDocuments(data: unknown, tokens: string[]): Omit<SearchResult, "source" | "score">[] {
  const payload = data as { data?: unknown[] } | unknown[];
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const picks: Omit<SearchResult, "source" | "score">[] = [];
  for (const row of (list as DocumentLike[]).slice(0, MAX_SCAN_ROWS)) {
    const title = text(row.title) || text(row.name);
    if (!title) continue;
    const subtitle = [text(row.kind) || text(row.category), text(row.owner)].filter(Boolean).join(" · ");
    if (!matchesAllTokens(`${title} ${subtitle}`, tokens)) continue;
    const id = text(row.id);
    if (!id) continue;
    picks.push({ id, title, subtitle, href: "/documents" });
  }
  return picks;
}

export interface KnowledgeHitLike {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  relevance?: unknown;
  excerpt?: unknown;
}

/** Normalizes one knowledge-search payload (route already ranked server-side). Pure. */
export function pickKnowledge(data: unknown): SearchResult[] {
  const list = (data as { data?: KnowledgeHitLike[] })?.data;
  if (!Array.isArray(list)) return [];
  const picks: SearchResult[] = [];
  for (const hit of list) {
    const id = text(hit.id);
    if (!id) continue;
    const relevance = typeof hit.relevance === "number" ? hit.relevance : 0;
    picks.push({
      source: "knowledge",
      id,
      title: text(hit.title) || "Knowledge",
      subtitle: text(hit.category),
      href: null,
      excerpt: text(hit.excerpt) || undefined,
      score: Math.max(0, Math.min(1, relevance)),
    });
  }
  return picks;
}

/**
 * Merges per-source picks into one ranked list. Pure — unit tested.
 * Knowledge hits keep their route-computed relevance; list sources are
 * scored by title×3/subtitle×1 token hits. Ties break by source priority,
 * then title, so ordering is fully deterministic.
 */
export function mergeRankedResults(
  tokens: string[],
  picks: { source: Exclude<SearchSourceKey, "knowledge">; items: Omit<SearchResult, "source" | "score">[] }[],
  knowledge: SearchResult[],
  limit: number,
): SearchResult[] {
  const merged: SearchResult[] = [...knowledge];
  for (const { source, items } of picks) {
    for (const item of items) {
      merged.push({ ...item, source, score: scorePick(item.title, item.subtitle, tokens) });
    }
  }
  const priority = new Map(SOURCE_PRIORITY.map((key, index) => [key, index]));
  merged.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const priorityDelta = (priority.get(a.source) ?? 99) - (priority.get(b.source) ?? 99);
    if (priorityDelta !== 0) return priorityDelta;
    return a.title.localeCompare(b.title);
  });
  return merged.slice(0, Math.max(1, limit));
}

async function fetchSource(
  origin: string,
  cookie: string,
  path: string,
): Promise<{ status: SourceStatus; payload: unknown }> {
  let response: Response;
  try {
    response = await fetch(`${origin}${path}`, {
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { status: "error", payload: null };
  }
  if (response.status === 401 || response.status === 403) return { status: "denied", payload: null };
  if (!response.ok) return { status: "error", payload: null };
  try {
    return { status: "ok", payload: (await response.json()) as unknown };
  } catch {
    return { status: "error", payload: null };
  }
}

export interface SearchFanOut {
  origin: string;
  cookie: string;
  query: string;
  limit: number;
}

/** Fans out to the four list routes and merges ranked results. */
export async function dispatchSearch(fanOut: SearchFanOut): Promise<SearchDispatchOutcome> {
  const tokens = tokenizeSearchQuery(fanOut.query);
  const encoded = encodeURIComponent(fanOut.query);
  const perSource = Math.min(25, Math.max(fanOut.limit, 10));
  const [employees, candidates, documents, knowledge] = await Promise.all([
    fetchSource(fanOut.origin, fanOut.cookie, "/api/employees"),
    fetchSource(fanOut.origin, fanOut.cookie, `/api/candidates?query=${encoded}&limit=${perSource}`),
    fetchSource(fanOut.origin, fanOut.cookie, "/api/documents"),
    fetchSource(fanOut.origin, fanOut.cookie, `/api/knowledge/search?q=${encoded}&limit=${perSource}`),
  ]);
  const sources: Record<SearchSourceKey, SourceStatus> = {
    employees: employees.status,
    candidates: candidates.status,
    documents: documents.status,
    knowledge: knowledge.status,
  };
  if (tokens.length === 0) return { results: [], sources };
  const results = mergeRankedResults(
    tokens,
    [
      { source: "employees", items: employees.status === "ok" ? pickEmployees(employees.payload, tokens) : [] },
      { source: "candidates", items: candidates.status === "ok" ? pickCandidates(candidates.payload) : [] },
      { source: "documents", items: documents.status === "ok" ? pickDocuments(documents.payload, tokens) : [] },
    ],
    knowledge.status === "ok" ? pickKnowledge(knowledge.payload) : [],
    fanOut.limit,
  );
  return { results, sources };
}
