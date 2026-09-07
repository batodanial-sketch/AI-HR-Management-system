/**
 * File validation — pure, runtime-agnostic, tested in isolation.
 *
 * Runs BEFORE any byte reaches storage: metadata, declared type, magic bytes,
 * size, filename safety and extension/MIME agreement. Rejection reasons are
 * stable codes so they can be metered without leaking file names.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB

export type AllowedKind = "pdf" | "docx" | "png" | "jpeg" | "webp";

export interface AllowedType {
  kind: AllowedKind;
  mime: string;
  extensions: string[];
  /** Returns true when the leading bytes match this type. */
  magic: (bytes: Uint8Array) => boolean;
}

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

export const ALLOWED_TYPES: AllowedType[] = [
  { kind: "pdf", mime: "application/pdf", extensions: ["pdf"], magic: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) }, // %PDF-
  {
    kind: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
    // ZIP local file header; DOCX is a ZIP container. Deeper structure is
    // verified by `looksLikeDocx` below (must contain [Content_Types].xml).
    magic: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
  { kind: "png", mime: "image/png", extensions: ["png"], magic: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { kind: "jpeg", mime: "image/jpeg", extensions: ["jpg", "jpeg"], magic: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { kind: "webp", mime: "image/webp", extensions: ["webp"], magic: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
];

export type ValidationCode =
  | "EMPTY_FILE"
  | "TOO_LARGE"
  | "INVALID_MIME"
  | "EXTENSION_MISMATCH"
  | "MALFORMED_FILE"
  | "SUSPICIOUS_FILENAME"
  | "PATH_TRAVERSAL"
  | "INVALID_METADATA";

export type ValidationResult =
  | { ok: true; kind: AllowedKind; mime: string; safeName: string; extension: string }
  | { ok: false; code: ValidationCode; message: string };

const SUSPICIOUS_EXT = /\.(exe|dll|bat|cmd|sh|ps1|js|jse|vbs|vbe|wsf|scr|com|pif|msi|jar|hta|lnk|php|py|rb|pl|apk|dmg|iso)(\.|$)/i;

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^\w.\-() ]+/g, "_").replace(/_{2,}/g, "_").slice(0, 140);
}

function looksLikeDocx(bytes: Uint8Array): boolean {
  // Cheap structural check: the ZIP must reference [Content_Types].xml
  // somewhere in the first 64 KiB (it is the first central entry in real DOCX).
  const window = bytes.subarray(0, Math.min(bytes.length, 65_536));
  const needle = "[Content_Types].xml";
  let text = "";
  for (let i = 0; i < window.length; i += 1) text += String.fromCharCode(window[i]);
  return text.includes(needle);
}

export interface FileDescriptor {
  name: string;
  declaredMime: string;
  size: number;
  /** Leading bytes (≥ 64 KiB recommended for DOCX structural check). */
  head: Uint8Array;
}

export function validateFile(file: FileDescriptor): ValidationResult {
  if (typeof file.name !== "string" || !file.name.trim() || typeof file.declaredMime !== "string") {
    return { ok: false, code: "INVALID_METADATA", message: "Missing file name or content type." };
  }
  const rawName = file.name;
  if (rawName.includes("..") || /[\\/]/.test(rawName) || rawName.includes("\0") || /^[.\s]/.test(rawName)) {
    return { ok: false, code: "PATH_TRAVERSAL", message: "File name contains path characters." };
  }
  if (SUSPICIOUS_EXT.test(rawName) || /[\u200b-\u200f\u202a-\u202e]/.test(rawName) || rawName.length > 200) {
    return { ok: false, code: "SUSPICIOUS_FILENAME", message: "File name is not allowed." };
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.head.length === 0) {
    return { ok: false, code: "EMPTY_FILE", message: "File is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: "TOO_LARGE", message: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB.` };
  }
  const declared = file.declaredMime.toLowerCase().split(";")[0].trim();
  const type = ALLOWED_TYPES.find((t) => t.mime === declared);
  if (!type) {
    return { ok: false, code: "INVALID_MIME", message: "Unsupported content type." };
  }
  const extension = (rawName.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? "").toLowerCase();
  if (!type.extensions.includes(extension)) {
    return { ok: false, code: "EXTENSION_MISMATCH", message: "File extension does not match its content type." };
  }
  if (!type.magic(file.head) || (type.kind === "docx" && !looksLikeDocx(file.head))) {
    return { ok: false, code: "MALFORMED_FILE", message: "File content does not match its declared type." };
  }
  return { ok: true, kind: type.kind, mime: type.mime, safeName: sanitizeFilename(rawName), extension };
}

/** Canonical, collision-free object key. Tenant prefix is mandatory. */
export function objectKey(organizationId: string, documentId: string, extension: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(organizationId) || !uuid.test(documentId)) throw new Error("objectKey requires UUID tenant and document ids");
  if (!/^[a-z0-9]{1,8}$/.test(extension)) throw new Error("objectKey requires a sanitized extension");
  return `organization/${organizationId}/documents/${documentId}.${extension}`;
}

/** True when `key` belongs to `organizationId` (defence in depth for every access path). */
export function keyBelongsToTenant(key: string, organizationId: string): boolean {
  return key.startsWith(`organization/${organizationId}/documents/`) && !key.includes("..");
}
