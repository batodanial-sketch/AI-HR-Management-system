import "server-only";

import { createHash } from "node:crypto";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/audit";
import { metrics } from "@/lib/observability/metrics";
import type { RbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/authz/model";
import { scanBytes, scannerEnforced, type ScanResult } from "./scanner";
import { tenantStorage } from "./provider";
import { objectKey, validateFile } from "./validate";

/**
 * Document pipeline:
 *   upload → validate metadata/type/size/magic → write to QUARANTINE key
 *          → malware scan → CLEAN: promote registry row to `clean`
 *                          → INFECTED: delete object, row `infected`
 *                          → UNAVAILABLE/TIMEOUT: delete object, row `rejected`
 *                            with retryable error (never accepted as clean)
 *          → audit → controlled (signed, expiring) access.
 *
 * Authorization: caller must be a canonical member of the tenant; upload and
 * delete require MANAGER+ / HR_ADMIN+ respectively (mirrors the RLS policies
 * on `document_files`, which are the last line of defence).
 */

export type DocumentStatus = "quarantined" | "clean" | "infected" | "rejected" | "deleted";

export interface DocumentRecord {
  id: string;
  organizationId: string;
  ownerType: "candidate" | "employee" | "company";
  ownerId: string | null;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  status: DocumentStatus;
  scanEngine: string | null;
  retentionUntil: string | null;
  createdAt: string;
}

export class DocumentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

const RETENTION_DAYS: Record<DocumentRecord["ownerType"], number> = { candidate: 365, employee: 365 * 7, company: 365 * 10 };
const SIGNED_URL_TTL_SECONDS = 120;

/* demo-mode registry (no Supabase) — same semantics, process-local */
const demoRegistry = new Map<string, DocumentRecord>();

function rowToRecord(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    ownerType: row.owner_type as DocumentRecord["ownerType"],
    ownerId: (row.owner_id as string | null) ?? null,
    originalName: String(row.original_name),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    sha256: String(row.sha256),
    storageKey: String(row.storage_key),
    status: row.status as DocumentStatus,
    scanEngine: (row.scan_engine as string | null) ?? null,
    retentionUntil: (row.retention_until as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

async function insertRecord(record: DocumentRecord, uploadedBy: string): Promise<void> {
  if (!hasSupabaseEnv()) {
    demoRegistry.set(record.id, record);
    return;
  }
  const { error } = await serverClient()
    .from("document_files" as never)
    .insert({
      id: record.id,
      organization_id: record.organizationId,
      uploaded_by: uploadedBy,
      owner_type: record.ownerType,
      owner_id: record.ownerId,
      original_name: record.originalName,
      content_type: record.contentType,
      size_bytes: record.sizeBytes,
      sha256: record.sha256,
      storage_bucket: tenantStorage(record.organizationId).provider.bucket,
      storage_key: record.storageKey,
      status: record.status,
      retention_until: record.retentionUntil,
    } as never);
  if (error) throw new DocumentError(500, "REGISTRY_WRITE_FAILED", "Could not register the document.", true);
}

async function updateStatus(record: DocumentRecord, status: DocumentStatus, scan: ScanResult | null): Promise<void> {
  if (!hasSupabaseEnv()) {
    const row = demoRegistry.get(record.id);
    if (row) {
      row.status = status;
      row.scanEngine = scan?.engine ?? row.scanEngine;
    }
    return;
  }
  const { error } = await serverClient()
    .from("document_files" as never)
    .update({
      status,
      scan_engine: scan?.engine ?? null,
      scan_result: scan ? { verdict: scan.verdict, signature: scan.signature ?? null, durationMs: scan.durationMs } : null,
      scanned_at: scan ? new Date().toISOString() : null,
      deleted_at: status === "deleted" ? new Date().toISOString() : null,
    } as never)
    .eq("id", record.id)
    .eq("organization_id", record.organizationId);
  if (error) throw new DocumentError(500, "REGISTRY_WRITE_FAILED", "Could not update the document.", true);
}

export async function getDocument(ctx: RbacContext, documentId: string): Promise<DocumentRecord | null> {
  if (!hasSupabaseEnv()) {
    const row = demoRegistry.get(documentId);
    return row && row.organizationId === ctx.organizationId ? row : null;
  }
  const { data } = await serverClient()
    .from("document_files" as never)
    .select("*")
    .eq("id", documentId)
    .eq("organization_id", ctx.organizationId) // RLS also enforces this
    .maybeSingle();
  return data ? rowToRecord(data as Record<string, unknown>) : null;
}

export interface UploadInput {
  name: string;
  declaredMime: string;
  bytes: Uint8Array;
  ownerType: DocumentRecord["ownerType"];
  ownerId: string | null;
}

export async function uploadDocument(ctx: RbacContext, input: UploadInput, requestId: string | null): Promise<DocumentRecord> {
  if (!roleAtLeast(ctx.role, "MANAGER")) {
    metrics.increment("authz_denials_total", { reason: "forbidden" });
    throw new DocumentError(403, "FORBIDDEN", "Your role cannot upload documents.");
  }
  if (!scannerEnforced()) {
    // Fail closed: without an enforced scanner, no document is ever accepted.
    metrics.increment("storage_failures_total", { op: "upload", reason: "scanner_unavailable" });
    throw new DocumentError(503, "SCANNER_UNAVAILABLE", "Document uploads are disabled until malware scanning is configured.", true);
  }

  const validation = validateFile({ name: input.name, declaredMime: input.declaredMime, size: input.bytes.byteLength, head: input.bytes.subarray(0, 65_536) });
  if (!validation.ok) {
    metrics.increment("storage_failures_total", { op: "upload", reason: validation.code === "TOO_LARGE" ? "too_large" : validation.code === "INVALID_MIME" || validation.code === "EXTENSION_MISMATCH" ? "invalid_type" : "malformed" });
    throw new DocumentError(422, validation.code, validation.message);
  }

  const id = crypto.randomUUID();
  const key = objectKey(ctx.organizationId, id, validation.extension);
  const record: DocumentRecord = {
    id,
    organizationId: ctx.organizationId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    originalName: validation.safeName,
    contentType: validation.mime,
    sizeBytes: input.bytes.byteLength,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    storageKey: key,
    status: "quarantined",
    scanEngine: null,
    retentionUntil: new Date(Date.now() + RETENTION_DAYS[input.ownerType] * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  const storage = tenantStorage(ctx.organizationId);
  await insertRecord(record, ctx.user.id);
  try {
    await storage.put(key, input.bytes, validation.mime);
    metrics.increment("storage_operations_total", { op: "upload", outcome: "quarantined" });
  } catch {
    metrics.increment("storage_failures_total", { op: "upload", reason: "unavailable" });
    await updateStatus(record, "rejected", null).catch(() => undefined);
    throw new DocumentError(503, "STORAGE_UNAVAILABLE", "Document storage is temporarily unavailable.", true);
  }

  const scan = await scanBytes(input.bytes, validation.safeName);
  const audit = (action: string, extra: Record<string, unknown>) =>
    recordAuditLog({
      actorId: ctx.user.id,
      actorType: "USER",
      action,
      targetModule: "documents",
      targetId: id,
      changes: { name: validation.safeName, size: record.sizeBytes, sha256: record.sha256, verdict: scan.verdict, requestId, ...extra },
      organizationId: ctx.organizationId,
    });

  if (scan.verdict === "clean") {
    await updateStatus(record, "clean", scan);
    record.status = "clean";
    record.scanEngine = scan.engine;
    await audit("document.upload.accepted", {});
    metrics.increment("storage_operations_total", { op: "upload", outcome: "clean" });
    return record;
  }

  // Not clean → never served. Remove the quarantined object.
  await storage.delete(key).catch(() => undefined);
  if (scan.verdict === "infected") {
    await updateStatus(record, "infected", scan);
    await audit("document.upload.rejected_infected", { signature: scan.signature ?? null });
    metrics.increment("storage_operations_total", { op: "upload", outcome: "infected" });
    throw new DocumentError(422, "MALWARE_DETECTED", "The file was rejected by malware scanning.");
  }
  await updateStatus(record, "rejected", scan);
  await audit("document.upload.rejected_scan_unavailable", { detail: scan.detail ?? null });
  metrics.increment("storage_failures_total", { op: "scan", reason: scan.verdict === "timeout" ? "scanner_timeout" : "scanner_unavailable" });
  throw new DocumentError(503, "SCAN_UNAVAILABLE", "Malware scanning is unavailable — the file was not accepted. Please retry.", true);
}

export async function documentDownloadUrl(ctx: RbacContext, documentId: string, origin: string): Promise<{ url: string; expiresInSeconds: number }> {
  const record = await getDocument(ctx, documentId);
  if (!record) throw new DocumentError(404, "NOT_FOUND", "Document not found.");
  if (record.status !== "clean") {
    metrics.increment("storage_failures_total", { op: "download", reason: "forbidden" });
    throw new DocumentError(409, "NOT_AVAILABLE", "Document is not available for download.");
  }
  const url = await tenantStorage(ctx.organizationId).signedUrl(record.storageKey, SIGNED_URL_TTL_SECONDS, origin);
  metrics.increment("storage_operations_total", { op: "sign", outcome: "ok" });
  await recordAuditLog({
    actorId: ctx.user.id,
    actorType: "USER",
    action: "document.download",
    targetModule: "documents",
    targetId: record.id,
    changes: { name: record.originalName },
    organizationId: ctx.organizationId,
  });
  return { url, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
}

/** Bytes for the local provider's controlled endpoint (signature verified by the route). */
export async function readDocumentBytes(organizationId: string, key: string): Promise<Uint8Array | null> {
  return tenantStorage(organizationId).get(key);
}

export async function deleteDocument(ctx: RbacContext, documentId: string): Promise<void> {
  if (!roleAtLeast(ctx.role, "HR_ADMIN")) {
    metrics.increment("authz_denials_total", { reason: "forbidden" });
    throw new DocumentError(403, "FORBIDDEN", "Your role cannot delete documents.");
  }
  const record = await getDocument(ctx, documentId);
  if (!record) throw new DocumentError(404, "NOT_FOUND", "Document not found.");
  await tenantStorage(ctx.organizationId).delete(record.storageKey);
  await updateStatus(record, "deleted", null);
  metrics.increment("storage_operations_total", { op: "delete", outcome: "ok" });
  await recordAuditLog({
    actorId: ctx.user.id,
    actorType: "USER",
    action: "document.delete",
    targetModule: "documents",
    targetId: record.id,
    changes: { name: record.originalName },
    organizationId: ctx.organizationId,
  });
}

/** Test-only. */
export function __resetDemoDocuments() {
  demoRegistry.clear();
}
