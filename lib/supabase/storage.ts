"use client";

/**
 * Browser-side resume upload.
 *
 * Phase R: resumes no longer go browser → public bucket. They are posted to
 * the server pipeline (`/api/documents/upload`) which enforces authorization,
 * file validation, quarantine → malware scan → accept/reject, tenant-scoped
 * private keys and audit. The value persisted on the candidate row is the
 * document id path (`/api/documents/<id>/download`), which mints a short-lived
 * signed URL for authorized users only — never a public URL.
 */

export function storageConfigured(): boolean {
  // The server decides whether storage is enabled; the client always offers
  // the control and surfaces the server's error if it is not.
  return true;
}

export class ResumeUploadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function uploadResume(candidateId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("ownerType", "candidate");
  form.append("ownerId", candidateId);
  const res = await fetch("/api/documents/upload", { method: "POST", body: form });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; code?: string; error?: string; data?: { id: string; status: string } } | null;
  if (!res.ok || !body?.ok || !body.data) {
    throw new ResumeUploadError(body?.code ?? `HTTP_${res.status}`, body?.error ?? "Upload failed.");
  }
  return `/api/documents/${body.data.id}/download`;
}
