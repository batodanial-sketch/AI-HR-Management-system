export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
);

export const isSupabaseAdminConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
);

export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}