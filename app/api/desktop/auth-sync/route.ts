import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { supabaseUrl, supabasePublishableKey } from '@/lib/supabase/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ accessToken: z.string().min(20) })

export async function POST(request: Request) {
  const url = supabaseUrl()
  const anonKey = supabasePublishableKey()
  if (!url || !anonKey) return Response.json({ success: false, error: 'Supabase public configuration is unavailable.' }, { status: 503 })
  try {
    const { accessToken } = schema.parse(await request.json())
    const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (error || !data.user) return Response.json({ success: false, error: 'Desktop access token is invalid.' }, { status: 401 })
    return Response.json({ success: true, data: { userId: data.user.id, email: data.user.email } })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(' ') : 'Invalid desktop auth-sync request.'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
