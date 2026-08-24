/**
 * Central resolution of Supabase credentials.
 *
 * The project has migrated from the legacy JWT API keys to Supabase's new
 * Publishable / Secret API keys. This module is the single source of truth for
 * resolving them, with the new names taking priority and the legacy names kept
 * as backward-compatible fallbacks:
 *
 *   - Public / client key : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
 *                           (fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
 *   - Server / admin key  : `SUPABASE_SECRET_KEY`
 *                           (fallback: `SUPABASE_SERVICE_ROLE_KEY`)
 *
 * Import this module from BOTH client and server helpers — it contains no
 * `server-only` directive and reads only `NEXT_PUBLIC_*`/server env vars, so it
 * is safe in browser bundles (Next.js inlines `NEXT_PUBLIC_*` at build time).
 */

/** First non-empty value wins — treats `""` and whitespace as unset. */
function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

/** Supabase project URL (unchanged across the key migration). */
export function supabaseUrl(): string {
  return firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * The public/publishable key — safe to expose to the browser. RLS applies.
 * Prefers the new `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, falling back to the
 * legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 */
export function supabasePublishableKey(): string {
  return firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * The secret/admin key — server-side only, bypasses RLS. Never expose this to
 * the browser. Prefers the new `SUPABASE_SECRET_KEY`, falling back to the
 * legacy `SUPABASE_SERVICE_ROLE_KEY`.
 */
export function supabaseSecretKey(): string {
  return firstNonEmpty(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
