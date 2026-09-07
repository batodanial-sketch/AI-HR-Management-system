import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { adminClient } from "@/lib/supabase/server";
import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/env";
import { keyBelongsToTenant } from "./validate";

/**
 * Object storage provider abstraction.
 *
 *   STORAGE_PROVIDER=supabase  → private Supabase Storage bucket
 *                                (STORAGE_BUCKET, default "documents"), server
 *                                side only via the secret key; downloads are
 *                                short-lived signed URLs.
 *   STORAGE_PROVIDER=local     → filesystem under STORAGE_LOCAL_DIR (default
 *                                ./.storage) — for local dev/tests ONLY. Access
 *                                is still mediated by HMAC-signed, expiring
 *                                URLs served by /api/documents/[id]/content;
 *                                raw filesystem paths are never exposed.
 *
 * Both providers refuse keys outside the calling tenant's prefix.
 */

export interface StorageProvider {
  name: "supabase" | "local";
  bucket: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** Controlled access: a URL that expires. */
  signedUrl(key: string, expiresInSeconds: number, origin: string): Promise<string>;
  /** Whether the bucket is confirmed private (supabase) or inherently private (local). */
  isPrivate(): Promise<boolean | "unknown">;
}

export type StorageProviderName = StorageProvider["name"];

export function storageProviderName(env: NodeJS.ProcessEnv = process.env): StorageProviderName {
  return (env.STORAGE_PROVIDER ?? "").toLowerCase() === "supabase" ? "supabase" : "local";
}

export function storageConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (storageProviderName(env) === "supabase") return Boolean(supabaseUrl() && supabaseSecretKey());
  return true;
}

function assertTenantKey(key: string, organizationId: string) {
  if (!keyBelongsToTenant(key, organizationId)) throw new Error("Object key does not belong to the tenant.");
}

/* ── local provider ─────────────────────────────────────────────────────── */
function localRoot(): string {
  return resolve(process.env.STORAGE_LOCAL_DIR ?? join(process.cwd(), ".storage"));
}

function localSigningSecret(): string {
  const s = process.env.STORAGE_SIGNING_SECRET ?? process.env.BRIDGE_SECRET_KEY ?? "";
  if (!s) throw new Error("STORAGE_SIGNING_SECRET is required for local storage signed URLs.");
  return s;
}

export function signLocalAccess(key: string, expiresAt: number): string {
  return createHmac("sha256", localSigningSecret()).update(`${key}:${expiresAt}`).digest("hex");
}

export function verifyLocalAccess(key: string, expiresAt: number, signature: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = signLocalAccess(key, expiresAt);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const localProvider: StorageProvider = {
  name: "local",
  bucket: "local",
  async put(key, bytes) {
    const path = join(localRoot(), key);
    if (!path.startsWith(localRoot() + sep)) throw new Error("Refusing to write outside storage root.");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
  },
  async get(key) {
    const path = join(localRoot(), key);
    if (!path.startsWith(localRoot() + sep)) return null;
    try {
      await stat(path);
      return new Uint8Array(await readFile(path));
    } catch {
      return null;
    }
  },
  async delete(key) {
    const path = join(localRoot(), key);
    if (!path.startsWith(localRoot() + sep)) return;
    await rm(path, { force: true });
  },
  async signedUrl(key, expiresInSeconds, origin) {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const documentId = key.split("/").pop()!.split(".")[0];
    const sig = signLocalAccess(key, expiresAt);
    return `${origin}/api/documents/${documentId}/content?exp=${expiresAt}&sig=${sig}`;
  },
  async isPrivate() {
    return true;
  },
};

/* ── supabase provider ──────────────────────────────────────────────────── */
function bucketName(): string {
  return process.env.STORAGE_BUCKET ?? "documents";
}

const supabaseProvider: StorageProvider = {
  name: "supabase",
  get bucket() {
    return bucketName();
  },
  async put(key, bytes, contentType) {
    const { error } = await adminClient().storage.from(bucketName()).upload(key, bytes, { contentType, upsert: false });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  },
  async get(key) {
    const { data, error } = await adminClient().storage.from(bucketName()).download(key);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  },
  async delete(key) {
    const { error } = await adminClient().storage.from(bucketName()).remove([key]);
    if (error) throw new Error(`storage delete failed: ${error.message}`);
  },
  async signedUrl(key, expiresInSeconds) {
    const { data, error } = await adminClient().storage.from(bucketName()).createSignedUrl(key, expiresInSeconds);
    if (error || !data?.signedUrl) throw new Error(`signed url failed: ${error?.message ?? "no url"}`);
    return data.signedUrl;
  },
  async isPrivate() {
    const { data, error } = await adminClient().storage.getBucket(bucketName());
    if (error || !data) return "unknown";
    return data.public === false;
  },
};

export function getStorageProvider(): StorageProvider {
  return storageProviderName() === "supabase" ? supabaseProvider : localProvider;
}

/** Tenant-guarded facade used by the document pipeline. */
export function tenantStorage(organizationId: string) {
  const provider = getStorageProvider();
  return {
    provider,
    put: (key: string, bytes: Uint8Array, contentType: string) => {
      assertTenantKey(key, organizationId);
      return provider.put(key, bytes, contentType);
    },
    get: (key: string) => {
      assertTenantKey(key, organizationId);
      return provider.get(key);
    },
    delete: (key: string) => {
      assertTenantKey(key, organizationId);
      return provider.delete(key);
    },
    signedUrl: (key: string, expiresInSeconds: number, origin: string) => {
      assertTenantKey(key, organizationId);
      return provider.signedUrl(key, expiresInSeconds, origin);
    },
  };
}
