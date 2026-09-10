import "server-only";

import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import type { CandidateProfile, JobProfile } from "./matching";

/**
 * Match-data loader (server-only).
 *
 * Builds matcher profiles from live, org-scoped rows: the candidate's tags
 * (the schema's skill proxy) + parsed-resume skills when a resume exists,
 * and the job's skills + explicit requirements + description. Every query is
 * pinned to the caller's canonical organization id AND runs under RLS.
 *
 * Returns null when Supabase is unconfigured — the route then answers an
 * honest 503 instead of matching against invented data.
 */

export class MatchDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchDataUnavailableError";
  }
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadCandidateProfile(organizationId: string, candidateId: string): Promise<CandidateProfile | null> {
  if (!hasSupabaseEnv()) return null;
  const { data: candidate } = await serverClient()
    .from("candidates")
    .select("id, tags, location")
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!candidate) return null;

  const skills = textArray((candidate as { tags?: unknown }).tags);
  // Best-effort: merge parsed-resume skills when a resume row exists.
  let summary: string | null = null;
  try {
    const { data: resume } = await serverClient()
      .from("resumes")
      .select("parsed_text, parsed_data")
      .eq("candidate_id", candidateId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (resume) {
      const parsed = (resume as { parsed_text?: unknown; parsed_data?: unknown }).parsed_data;
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        for (const key of ["skills", "skillSet", "technologies"]) {
          skills.push(...textArray(record[key]));
        }
        const years = numOrNull(record["yearsOfExperience"] ?? record["experience_years"]);
        if (years !== null) {
          return {
            skills: [...new Set(skills)],
            experienceYears: years,
            location: textOrNull((candidate as { location?: unknown }).location),
            summary: textOrNull((resume as { parsed_text?: unknown }).parsed_text)?.slice(0, 2000) ?? null,
            tags: textArray((candidate as { tags?: unknown }).tags),
          };
        }
      }
      summary = textOrNull((resume as { parsed_text?: unknown }).parsed_text)?.slice(0, 2000) ?? null;
    }
  } catch {
    // Resume enrichment is best-effort; the tag-derived profile still stands.
  }

  return {
    skills: [...new Set(skills)],
    experienceYears: null,
    location: textOrNull((candidate as { location?: unknown }).location),
    summary,
    tags: textArray((candidate as { tags?: unknown }).tags),
  };
}

export async function loadJobProfile(organizationId: string, jobOpeningId: string): Promise<JobProfile | null> {
  if (!hasSupabaseEnv()) return null;
  const { data: job } = await serverClient()
    .from("job_openings")
    .select("id, title, description, requirements, skills, employment_type, min_salary, max_salary, department_id, location_id")
    .eq("id", jobOpeningId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!job) return null;
  const row = job as Record<string, unknown>;

  // Location is FK-based; resolve the label best-effort (null when unresolvable).
  let location: string | null = null;
  if (typeof row["location_id"] === "string" && row["location_id"]) {
    try {
      const { data: loc } = await serverClient()
        .from("locations")
        .select("city, country")
        .eq("id", row["location_id"] as string)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (loc) {
        const l = loc as { city?: unknown; country?: unknown };
        location = [l.city, l.country].filter((v): v is string => typeof v === "string" && v.length > 0).join(", ") || null;
      }
    } catch {
      location = null;
    }
  }

  return {
    title: typeof row["title"] === "string" ? row["title"] : "",
    description: typeof row["description"] === "string" ? row["description"] : "",
    requirements: textArray(row["requirements"]),
    skills: textArray(row["skills"]),
    location,
    employmentType: textOrNull(row["employment_type"]),
    minExperienceYears: null, // schema has no experience-minimum column; never invented
  };
}
