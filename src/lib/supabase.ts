import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export * from './database.types'

/**
 * Strongly-typed Supabase client (the shape returned by the factories below).
 * Use this as the parameter type for any helper that receives a client, so no
 * function in `app/actions/*` needs `any`.
 */
export type SupabaseTypedClient = SupabaseClient<Database>

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
// New Publishable key first, legacy anon key as backward-compatible fallback.
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// New Secret key first, legacy service-role key as backward-compatible fallback.
const supabaseServiceRoleKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

let browserClient: SupabaseClient<Database> | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const isSupabaseAdminConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey)

function getPublicEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.')
  }
  return { url: supabaseUrl, key: supabaseAnonKey }
}

function getAdminEnv() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase admin client is not configured. Set SUPABASE_SECRET_KEY only in the server environment.')
  }
  return { url: supabaseUrl, key: supabaseServiceRoleKey }
}

/**
 * Browser client for authenticated client components. RLS always applies.
 * Do not use this client for tenant bootstrap, admin jobs, or system writes.
 */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const { url, key } = getPublicEnv()
    browserClient = createBrowserClient<Database>(url, key)
  }
  return browserClient
}

/**
 * Server / Server Action client bound to the current request cookies.
 * RLS applies using the Supabase Auth session represented by auth.uid().
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const { url, key } = getPublicEnv()
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot set cookies. Route handlers and Server
          // Actions can; Supabase will still read the request session safely.
        }
      }
    }
  })
}

/**
 * Service-role client for trusted server-only jobs, scheduled work, and
 * organization bootstrap. This bypasses RLS. Never import or call it from
 * a Client Component and never expose SUPABASE_SERVICE_ROLE_KEY to users.
 */
export function createAdminSupabaseClient(): SupabaseClient<Database> {
  const { url, key } = getAdminEnv()
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })
}
