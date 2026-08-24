"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabasePublishableKey } from "./env";

/**
 * Browser-side resume upload to Supabase Storage.
 *
 * Files are stored under `candidate-resumes/<candidateId>/<filename>`. The
 * bucket must be created once (public) — see `supabase/storage/README.md`.
 * Returns the public URL so the caller can persist it on the candidate row.
 */

const RESUME_BUCKET = "candidate-resumes";

export function storageConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export async function uploadResume(
  candidateId: string,
  file: File,
): Promise<string> {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new Error("Supabase storage is not configured.");
  }

  const supabase = createBrowserClient(url, key);
  const path = `${candidateId}/${file.name.replace(/[^\w.\-]+/g, "_")}`;

  const { error } = await supabase.storage
    .from(RESUME_BUCKET)
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(RESUME_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
