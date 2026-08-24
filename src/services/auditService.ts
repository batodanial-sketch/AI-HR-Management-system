import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditLogRow, Database, Json } from '@/src/lib/supabase'

export async function writeAuditLog(supabase: SupabaseClient<Database>, input: { organizationId: string; actorUserId?: string | null; action: AuditLogRow['action']; entityType: string; entityId?: string | null; beforeState?: Json | null; afterState?: Json | null }) {
  const { data, error } = await supabase.from('audit_logs').insert({ organization_id: input.organizationId, actor_user_id: input.actorUserId || null, action: input.action, entity_type: input.entityType, entity_id: input.entityId || null, before_state: input.beforeState || null, after_state: input.afterState || null }).select().single()
  if (error || !data) throw new Error(error?.message || 'Audit log creation returned no record.')
  return data as AuditLogRow
}

export async function listAuditLogs(supabase: SupabaseClient<Database>, organizationId: string, limit = 100) {
  const { data, error } = await supabase.from('system_audit_logs').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(error.message)
  return (data || []) as AuditLogRow[]
}
