import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { supabaseUrl, supabasePublishableKey, supabaseSecretKey } from "./env";

/**
 * Shared server-side Supabase client factory.
 *
 * Cookie handling follows the official Next.js App Router pattern for
 * `@supabase/ssr`: `getAll` reads the incoming request cookies and `setAll`
 * writes refreshed tokens back to the response. `setAll` is wrapped in a
 * try/catch because Server Components cannot write cookies after the response
 * has started — token refreshes are handled by middleware in production.
 *
 * Keys are resolved through `lib/supabase/env.ts`: the new Publishable/Secret
 * keys take priority, with the legacy JWT keys as fallbacks.
 */

export function hasSupabaseEnv(): boolean {
  return Boolean(supabaseUrl() && (supabasePublishableKey() || supabaseSecretKey()));
}

export function serverClient() {
  const url = supabaseUrl();
  const key = supabasePublishableKey() || supabaseSecretKey();

  if (!url || !key) {
    throw new Error(
      "Supabase environment variables are not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).",
    );
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookies().getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookies().set(name, value, options),
          );
        } catch {
          // Called from a Server Component; middleware handles refreshes.
        }
      },
    },
  });
}

/**
 * Service-role admin client — server-side only, never exposed to the browser.
 * Used for privileged operations such as auto-confirming a trial sign-up email
 * or erasing an account. Intentionally untyped (like the memory adapter): the
 * live legacy schema has drifted from the generated `Database` types, so table
 * access is schema-agnostic here.
 *
 * Uses the Secret key (`SUPABASE_SECRET_KEY`, fallback `SUPABASE_SERVICE_ROLE_KEY`)
 * with auth persistence disabled.
 */
export function adminClient() {
  const url = supabaseUrl();
  const secretKey = supabaseSecretKey();

  if (!url || !secretKey) {
    throw new Error(
      "Supabase secret key is not configured (SUPABASE_SECRET_KEY).",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
