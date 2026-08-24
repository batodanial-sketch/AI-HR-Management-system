import "server-only";
import { createPublicKey, verify } from "node:crypto";
import { readSettings, writeSettings } from "./settings/config";
import { recordAudit } from "./audit";
import {
  hasFeatureAccess,
  daysRemaining,
  TRIAL_DAYS,
  TRIAL_MAX_EMPLOYEES,
  type FeatureKey,
  type LicenseState,
  type LicenseTier,
} from "./license-format";

export type { FeatureKey, LicenseState, LicenseTier };
export { hasFeatureAccess, daysRemaining, TRIAL_DAYS, TRIAL_MAX_EMPLOYEES };

/**
 * Offline license verification + trial management.
 *
 * PRO/ENTERPRISE licenses are Ed25519-signed keys (`FLUX-PRO-…` / `FLUX-ENT-…`)
 * verified entirely offline against the embedded public key. The 15-day trial
 * is a local, expiring state (no signature) written to `data/settings.json`.
 */

/** Embedded public key (override via LICENSE_PUBLIC_KEY env, PEM). */
const DEFAULT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAId7KDV4lLYmMbFB7Q+2B2Kd9FB60WbPSv3yBUvLGf4A=
-----END PUBLIC KEY-----`;

function publicKey(): ReturnType<typeof createPublicKey> {
  const pem = process.env.LICENSE_PUBLIC_KEY ?? DEFAULT_PUBLIC_KEY_PEM;
  return createPublicKey(pem);
}

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

interface SignedPayload {
  tier?: string;
  ownerEmail?: string;
  organizationName?: string;
  maxUsers?: number;
  issuedAt?: string;
  expiresAt?: string | null;
  allowedFeatures?: string[];
}

const PREFIXES: Array<{ prefix: string; tier: LicenseTier }> = [
  { prefix: "FLUX-ENT-", tier: "ENTERPRISE" },
  { prefix: "FLUX-PRO-", tier: "PRO" },
];

function parseTier(value: unknown, fallback: LicenseTier): LicenseTier {
  if (value === "ENTERPRISE" || value === "enterprise") {
    return "ENTERPRISE";
  }
  if (value === "PRO" || value === "pro") {
    return "PRO";
  }
  return fallback;
}

/**
 * Verifies a signed license key and returns its state, or null if invalid or
 * expired. Pure (no side effects) so it works in middleware, routes, actions.
 */
export function verifyLicenseKey(key: string): LicenseState | null {
  const trimmed = key.trim();
  const match = PREFIXES.find((entry) => trimmed.startsWith(entry.prefix));
  if (!match) {
    return null;
  }

  const body = trimmed.slice(match.prefix.length);
  const dot = body.indexOf(".");
  if (dot === -1) {
    return null;
  }
  const payloadB64 = body.slice(0, dot);
  const signatureB64 = body.slice(dot + 1);
  if (!payloadB64 || !signatureB64) {
    return null;
  }

  let payloadJson: Buffer;
  let signature: Buffer;
  try {
    payloadJson = b64urlDecode(payloadB64);
    signature = b64urlDecode(signatureB64);
  } catch {
    return null;
  }

  let valid = false;
  try {
    valid = verify(null, payloadJson, publicKey(), signature);
  } catch {
    return null;
  }
  if (!valid) {
    return null;
  }

  let payload: SignedPayload;
  try {
    payload = JSON.parse(payloadJson.toString("utf8")) as SignedPayload;
  } catch {
    return null;
  }

  const tier = parseTier(payload.tier, match.tier);
  const perpetual = !payload.expiresAt;
  if (!perpetual) {
    const expiry = new Date(`${payload.expiresAt}T23:59:59Z`);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() < Date.now()) {
      return null;
    }
  }

  const allowedFeatures = Array.isArray(payload.allowedFeatures)
    ? payload.allowedFeatures.map(String)
    : ["*"];

  return {
    tier,
    ownerEmail: typeof payload.ownerEmail === "string" ? payload.ownerEmail : "",
    organizationName:
      typeof payload.organizationName === "string" ? payload.organizationName : "",
    maxUsers: Number.isFinite(payload.maxUsers) ? (payload.maxUsers as number) : 0,
    issuedAt: typeof payload.issuedAt === "string" ? payload.issuedAt : "",
    expiresAt: perpetual ? null : (payload.expiresAt as string),
    allowedFeatures,
    perpetual,
    key: trimmed,
    activatedAt: new Date().toISOString(),
  };
}

/**
 * Returns the effective license state: a re-verified PRO/ENTERPRISE key, an
 * active (unexpired) trial, or null when neither applies.
 */
export async function getLicenseState(): Promise<LicenseState | null> {
  const settings = await readSettings();
  const stored = settings.license;
  if (!stored) {
    return null;
  }
  if (stored.key) {
    return verifyLicenseKey(stored.key);
  }
  if (stored.tier === "TRIAL") {
    if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
      return null;
    }
    return stored;
  }
  return null;
}

/** Validates and persists a PRO/ENTERPRISE license key. */
export async function activateLicense(key: string): Promise<LicenseState> {
  const verified = verifyLicenseKey(key);
  if (!verified) {
    throw new Error("Invalid or expired license key.");
  }
  await writeSettings({ license: verified });
  void recordAudit({
    action: "license.activate",
    entity: "license",
    metadata: { tier: verified.tier, org: verified.organizationName },
  });
  return verified;
}

/** Starts (or resumes) the 15-day trial, unless a paid license is active. */
export async function startTrial(): Promise<LicenseState> {
  const existing = await getLicenseState();
  if (existing && existing.tier !== "TRIAL") {
    return existing; // never downgrade an active paid license
  }
  if (existing && existing.tier === "TRIAL" && daysRemaining(existing) > 0) {
    return existing; // trial already active
  }

  const now = new Date();
  const ends = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
  const state: LicenseState = {
    tier: "TRIAL",
    ownerEmail: "",
    organizationName: "",
    maxUsers: TRIAL_MAX_EMPLOYEES,
    issuedAt: now.toISOString(),
    expiresAt: ends.toISOString(),
    allowedFeatures: [],
    perpetual: false,
    key: null,
    activatedAt: now.toISOString(),
    trialStartedAt: now.toISOString(),
    trialEndsAt: ends.toISOString(),
  };
  await writeSettings({ license: state });
  void recordAudit({
    action: "trial.start",
    entity: "license",
    metadata: { tier: "TRIAL", endsAt: ends.toISOString() },
  });
  return state;
}
