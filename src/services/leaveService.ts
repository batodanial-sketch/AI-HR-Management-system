import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, LeaveRequestRow } from '@/src/lib/supabase'

export async function findLeaveRequests(supabase: SupabaseClient<Database>, organizationId: string, status?: LeaveRequestRow['status']) {
  let query = supabase.from('leave_requests').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data || []) as LeaveRequestRow[]
}

export async function findLeaveRequest(supabase: SupabaseClient<Database>, organizationId: string, leaveRequestId: string) {
  const { data, error } = await supabase.from('leave_requests').select('*').eq('organization_id', organizationId).eq('id', leaveRequestId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data || null) as LeaveRequestRow | null
}
