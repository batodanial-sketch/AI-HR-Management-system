'use server'

import { z } from 'zod'
import { createServerSupabaseClient, isSupabaseConfigured, type Database, type OrganizationMembershipRow, type RoleRow } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { requireOrganizationContext, validationFailure } from './_shared'

const bootstrapSchema = z.object({
  workspaceName: z.string().trim().min(2).max(180),
  workspaceSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens only.').max(80)
})

export type WorkspaceAccessState =
  | { authenticated: false }
  | {
      authenticated: true
      user: { id: string; email: string; fullName: string }
      membership: { organizationId: string; roleCode: string } | null
    }

export async function getWorkspaceAccessAction(): Promise<ActionResponse<WorkspaceAccessState>> {
  if (!isSupabaseConfigured) return actionFailure('Supabase public configuration is unavailable.')
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) return actionSuccess({ authenticated: false })

    const [profileResult, membershipResult] = await Promise.all([
      supabase.from('users').select('id,email,full_name').eq('id', authData.user.id).maybeSingle(),
      supabase.from('organization_memberships').select('*').eq('user_id', authData.user.id).eq('status', 'active').limit(1).maybeSingle()
    ])
    const error = profileResult.error || membershipResult.error
    if (error) return actionFailure(error.message)
    if (!profileResult.data) return actionFailure('Your Supabase Auth profile has not synchronized to public.users yet. Refresh after signup or verify the auth profile trigger.')

    const profile = profileResult.data as { id: string; email: string; full_name: string }
    const membership = membershipResult.data as OrganizationMembershipRow | null
    if (!membership) return actionSuccess({ authenticated: true, user: { id: profile.id, email: profile.email, fullName: profile.full_name }, membership: null })

    let roleCode = 'member'
    if (membership.role_id) {
      const { data: role, error: roleError } = await supabase.from('roles').select('*').eq('id', membership.role_id).maybeSingle()
      if (roleError) return actionFailure(roleError.message)
      roleCode = ((role as RoleRow | null)?.code || 'member').toLowerCase()
    }
    return actionSuccess({ authenticated: true, user: { id: profile.id, email: profile.email, fullName: profile.full_name }, membership: { organizationId: membership.organization_id, roleCode } })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to resolve workspace access.')
  }
}

export type WorkspaceReadiness = {
  organizationId: string
  roleCode: string
  checks: Array<{ resource: string; available: boolean }>
}

/** Tables verified by the RLS readiness check (all have `organization_id`). */
type OrgScopedTable =
  | 'employees'
  | 'job_openings'
  | 'attendance_records'
  | 'leave_requests'
  | 'payroll_cycles'
  | 'performance_reviews'
  | 'onboarding_enrollments'
  | 'documents'
  | 'workflows'
  | 'system_audit_logs'

export async function verifyAuthenticatedWorkspaceReadinessAction(): Promise<ActionResponse<WorkspaceReadiness>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    // Tenant-scoped tables (all carry an `organization_id` column). The
    // `organizations` table is excluded — it is keyed by `id`, not
    // `organization_id`, and is already verified via the active membership.
    const resources: Array<[string, OrgScopedTable]> = [
      ['employee_directory', 'employees'],
      ['recruitment', 'job_openings'],
      ['attendance', 'attendance_records'],
      ['leave', 'leave_requests'],
      ['payroll', 'payroll_cycles'],
      ['performance', 'performance_reviews'],
      ['onboarding', 'onboarding_enrollments'],
      ['documents', 'documents'],
      ['automations', 'workflows'],
      ['audit_logs', 'system_audit_logs']
    ]
    const results = await Promise.all(resources.map(async ([resource, relation]) => {
      const { error } = await supabase.from(relation).select('id', { head: true, count: 'exact' }).eq('organization_id', auth.data.organizationId)
      return { resource, error }
    }))
    const failed = results.find(result => result.error)
    if (failed?.error) return actionFailure(`RLS readiness check failed for ${failed.resource}: ${failed.error.message}`)
    return actionSuccess({ organizationId: auth.data.organizationId, roleCode: auth.data.roleCode, checks: results.map(result => ({ resource: result.resource, available: true })) })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to verify authenticated workspace readiness.')
  }
}

export async function bootstrapWorkspaceAction(input: z.input<typeof bootstrapSchema>): Promise<ActionResponse<{ organizationId: string; organizationName: string; organizationSlug: string; roleCode: string }>> {
  const parsed = bootstrapSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  if (!isSupabaseConfigured) return actionFailure('Supabase public configuration is unavailable.')
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) return actionFailure('Authentication is required to create your first workspace.')

    const { data, error } = await supabase.rpc('bootstrap_organization', {
      workspace_name: parsed.data.workspaceName,
      workspace_slug: parsed.data.workspaceSlug
    })
    if (error) return actionFailure(error.message)
    const result = Array.isArray(data) ? data[0] : data
    if (!result?.organization_id) return actionFailure('Workspace bootstrap returned no organization record.')
    return actionSuccess({ organizationId: result.organization_id as string, organizationName: result.organization_name as string, organizationSlug: result.organization_slug as string, roleCode: result.role_code as string })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to bootstrap the workspace.')
  }
}
