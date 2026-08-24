'use server'

import { z } from 'zod'
import { createServerSupabaseClient, type AuditLogRow, type SystemAuditLogRow } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { requireOrganizationContext, uuidSchema, validationFailure } from './_shared'

const auditFilterSchema = z.object({
  entityType: z.string().max(120).optional(),
  actorUserId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50)
})

export async function getSystemAuditLogsAction(input: z.input<typeof auditFilterSchema> = {}): Promise<ActionResponse<SystemAuditLogRow[]>> {
  const parsed = auditFilterSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    let query = supabase.from('system_audit_logs').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }).limit(parsed.data.limit)
    if (parsed.data.entityType) query = query.eq('entity_type', parsed.data.entityType)
    if (parsed.data.actorUserId) query = query.eq('actor_user_id', parsed.data.actorUserId)
    const { data, error } = await query
    if (error) return actionFailure(error.message)
    return actionSuccess((data || []) as SystemAuditLogRow[])
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load system audit logs.')
  }
}

export async function exportAuditLogsAction(limit = 500): Promise<ActionResponse<AuditLogRow[]>> {
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  const parsedLimit = z.number().int().min(1).max(1000).safeParse(limit)
  if (!parsedLimit.success) return validationFailure(parsedLimit.error)
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('audit_logs').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }).limit(parsedLimit.data)
    if (error) return actionFailure(error.message)
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'export', entity_type: 'audit_logs', entity_id: null, before_state: null, after_state: { exported_count: (data || []).length } })
    return actionSuccess((data || []) as AuditLogRow[])
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to export audit logs.')
  }
}
