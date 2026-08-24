/**
 * License types + pure helpers (client-safe — no `server-only`, no node:crypto).
 *
 * The canonical license state is shared by the server verifier, the middleware
 * gate, the activation screen, the trial banner, and every feature lock. Kept
 * dependency-free so client components can render license UI without pulling
 * in server-only modules.
 */

export type LicenseTier = "TRIAL" | "PRO" | "ENTERPRISE";

/** Feature keys gated behind Pro/Enterprise. */
export type FeatureKey =
  | "leads_export" // bulk CSV export from Lead Intelligence
  | "custom_ai" // custom BYOK AI endpoint configuration
  | "unlimited_employees" // headcount above the trial cap
  | "branding"; // white-label branding controls

export interface LicenseState {
  tier: LicenseTier;
  ownerEmail: string;
  organizationName: string;
  maxUsers: number;
  issuedAt: string;
  /** ISO date (YYYY-MM-DD) or null for perpetual. */
  expiresAt: string | null;
  allowedFeatures: string[]; // ['*'] for PRO/ENTERPRISE, [] for TRIAL
  perpetual: boolean;
  /** The signed key for PRO/ENTERPRISE; null for a locally-created trial. */
  key: string | null;
  activatedAt: string;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
}

export const TRIAL_DAYS = 15;
export const TRIAL_MAX_EMPLOYEES = 10;

export const TIER_LABELS: Record<LicenseTier, string> = {
  TRIAL: "15-Day Free Trial",
  PRO: "Pro Subscription",
  ENTERPRISE: "Enterprise Source Code",
};

export function maskLicenseKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 24) {
    return trimmed;
  }
  return `${trimmed.slice(0, 16)}…${trimmed.slice(-6)}`;
}

/** Whole days until expiry (Infinity when perpetual). */
export function daysRemaining(state: LicenseState): number {
  if (!state.expiresAt) {
    return Infinity;
  }
  const end = new Date(state.expiresAt).getTime();
  if (Number.isNaN(end)) {
    return Infinity;
  }
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

/** True when the state grants access to a gated feature. */
export function hasFeatureAccess(
  state: LicenseState | null,
  feature: FeatureKey,
): boolean {
  if (!state) {
    return false;
  }
  if (state.tier === "PRO" || state.tier === "ENTERPRISE") {
    return true;
  }
  return (
    state.allowedFeatures.includes("*") ||
    state.allowedFeatures.includes(feature)
  );
}
