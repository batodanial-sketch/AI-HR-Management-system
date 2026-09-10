import "server-only";

import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import type { KnowledgeEntry } from "./search";

/**
 * Company-knowledge store (server-only). All access is org-scoped (explicit
 * eq + RLS). Returns [] / null when Supabase is unconfigured — routes then
 * answer honestly (empty results / 503 for writes).
 */

function toEntry(row: Record<string, unknown>): KnowledgeEntry {
  return {
    id: String(row["id"] ?? ""),
    title: typeof row["title"] === "string" ? row["title"] : "",
    content: typeof row["content"] === "string" ? row["content"] : "",
    source: typeof row["source"] === "string" ? row["source"] : "manual",
    tags: Array.isArray(row["tags"]) ? row["tags"].filter((t): t is string => typeof t === "string") : [],
    updatedAt: typeof row["updated_at"] === "string" ? row["updated_at"] : "",
  };
}

export async function listKnowledgeEntries(organizationId: string, limit = 200): Promise<KnowledgeEntry[]> {
  if (!hasSupabaseEnv()) return [];
  const { data, error } = await serverClient()
    .from("company_knowledge" as never)
    .select("id, title, content, source, tags, updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map(toEntry);
}

export async function createKnowledgeEntry(
  organizationId: string,
  actorId: string,
  input: { title: string; content: string; source?: string; tags?: string[] },
): Promise<KnowledgeEntry | null> {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await serverClient()
    .from("company_knowledge" as never)
    .insert({
      organization_id: organizationId,
      title: input.title,
      content: input.content,
      source: input.source ?? "manual",
      tags: input.tags ?? [],
      created_by: actorId,
    } as never)
    .select("id, title, content, source, tags, updated_at")
    .single();
  if (error || !data) return null;
  return toEntry(data as unknown as Record<string, unknown>);
}

export async function deleteKnowledgeEntry(organizationId: string, id: string): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  const { error } = await serverClient()
    .from("company_knowledge" as never)
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);
  return !error;
}
