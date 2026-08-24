'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import { isGroqConfigured } from '@/src/lib/ai/groqClient'
import { createServerSupabaseClient, type OrganizationRow, type UserRow } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { requireOrganizationContext, revalidateWorkspacePaths, validationFailure } from './_shared'

const jsonRecord = z.record(z.string(), z.unknown())
const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(180),
  legalName: z.string().max(240).optional().nullable(),
  timezone: z.string().min(2).max(100),
  locale: z.string().min(2).max(20),
  currencyCode: z.string().length(3).transform(value => value.toUpperCase()),
  settings: jsonRecord.default({})
})
const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(180),
  phone: z.string().max(64).optional().nullable(),
  notificationPreferences: z.object({ email: z.boolean(), workflow: z.boolean(), risk: z.boolean() })
})

export type WorkspaceSettings = {
  organization: Pick<OrganizationRow, 'id' | 'name' | 'legal_name' | 'timezone' | 'locale' | 'currency_code' | 'settings'>
  user: Pick<UserRow, 'id' | 'email' | 'full_name' | 'phone' | 'metadata'>
  integrationStatus: {
    groqConfigured: boolean
    pythonBridgeConfigured: boolean
    n8nConfigured: boolean
  }
}

function preferencesFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return { email: true, workflow: true, risk: true }
  const raw = (metadata as Record<string, unknown>).notification_preferences
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { email: true, workflow: true, risk: true }
  const value = raw as Record<string, unknown>
  return { email: value.email !== false, workflow: value.workflow !== false, risk: value.risk !== false }
}

export type WorkspaceHeader = {
  user: Pick<UserRow, 'id' | 'email' | 'full_name' | 'avatar_url'>
  notifications: Array<{ id: string; title: string; body: string | null; created_at: string; read_at: string | null }>
}

export async function getWorkspaceHeaderAction(): Promise<ActionResponse<WorkspaceHeader>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [userResult, notificationsResult] = await Promise.all([
      supabase.from('users').select('id,email,full_name,avatar_url').eq('id', auth.data.userId).maybeSingle(),
      supabase.from('notifications').select('id,title,body,created_at,read_at').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }).limit(8)
    ])
    const error = userResult.error || notificationsResult.error
    if (error) return actionFailure(error.message)
    if (!userResult.data) return actionFailure('Authenticated user profile was not found.')
    return actionSuccess({ user: userResult.data as WorkspaceHeader['user'], notifications: (notificationsResult.data || []) as WorkspaceHeader['notifications'] })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load workspace header data.')
  }
}

export async function getWorkspaceSettingsAction(): Promise<ActionResponse<WorkspaceSettings & { notificationPreferences: { email: boolean; workflow: boolean; risk: boolean } }>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [organizationResult, userResult] = await Promise.all([
      supabase.from('organizations').select('id,name,legal_name,timezone,locale,currency_code,settings').eq('id', auth.data.organizationId).maybeSingle(),
      supabase.from('users').select('id,email,full_name,phone,metadata').eq('id', auth.data.userId).maybeSingle()
    ])
    const error = organizationResult.error || userResult.error
    if (error) return actionFailure(error.message)
    if (!organizationResult.data || !userResult.data) return actionFailure('Workspace organization or user profile was not found.')
    const user = userResult.data as WorkspaceSettings['user']
    return actionSuccess({
      organization: organizationResult.data as WorkspaceSettings['organization'],
      user,
      notificationPreferences: preferencesFromMetadata(user.metadata),
      integrationStatus: {
        groqConfigured: isGroqConfigured(),
        pythonBridgeConfigured: Boolean(process.env.PYTHON_BRIDGE_TOKEN),
        n8nConfigured: Boolean(process.env.N8N_WEBHOOK_SECRET)
      }
    })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load workspace settings.')
  }
}

export async function updateWorkspaceOrganizationAction(input: z.input<typeof updateOrganizationSchema>): Promise<ActionResponse<WorkspaceSettings['organization']>> {
  const parsed = updateOrganizationSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: existing, error: lookupError } = await supabase.from('organizations').select('name,legal_name,timezone,locale,currency_code,settings').eq('id', auth.data.organizationId).maybeSingle()
    if (lookupError || !existing) return actionFailure(lookupError?.message || 'Organization was not found.')
    const { data, error } = await supabase.from('organizations').update({
      name: parsed.data.name,
      legal_name: parsed.data.legalName || null,
      timezone: parsed.data.timezone,
      locale: parsed.data.locale,
      currency_code: parsed.data.currencyCode,
      settings: toJson(parsed.data.settings),
      updated_at: new Date().toISOString()
    }).eq('id', auth.data.organizationId).select('id,name,legal_name,timezone,locale,currency_code,settings').single()
    if (error || !data) return actionFailure(error?.message || 'Organization settings update returned no record.')
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'update',
      entity_type: 'organization_settings',
      entity_id: auth.data.organizationId,
      before_state: existing,
      after_state: data
    })
    revalidateWorkspacePaths('/', '/settings')
    return actionSuccess(data as WorkspaceSettings['organization'])
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update organization settings.')
  }
}

export async function updateWorkspaceProfileAction(input: z.input<typeof updateProfileSchema>): Promise<ActionResponse<WorkspaceSettings['user']>> {
  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: existing, error: lookupError } = await supabase.from('users').select('full_name,phone,metadata').eq('id', auth.data.userId).maybeSingle()
    if (lookupError || !existing) return actionFailure(lookupError?.message || 'User profile was not found.')
    const existingMetadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata as Record<string, unknown> : {}
    const metadata = { ...existingMetadata, notification_preferences: parsed.data.notificationPreferences }
    const { data, error } = await supabase.from('users').update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null, metadata, updated_at: new Date().toISOString() }).eq('id', auth.data.userId).select('id,email,full_name,phone,metadata').single()
    if (error || !data) return actionFailure(error?.message || 'User profile update returned no record.')
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'update',
      entity_type: 'user_settings',
      entity_id: auth.data.userId,
      before_state: { full_name: existing.full_name, phone: existing.phone },
      after_state: { full_name: parsed.data.fullName, phone: parsed.data.phone || null, notification_preferences: parsed.data.notificationPreferences }
    })
    revalidateWorkspacePaths('/', '/settings')
    return actionSuccess(data as WorkspaceSettings['user'])
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update user settings.')
  }
}
