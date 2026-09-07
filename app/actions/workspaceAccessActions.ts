'use server'

import { z } from 'zod'
import { createServerSupabaseClient, isSupabaseConfigured } from '@/src/lib/supabase'
import { resolveCanonicalAuthz } from '@/lib/authz/canonical'
import { denyMessage } from '@/lib/authz/model'
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

/**
 * Reports the caller's authentication + canonical membership state.
 * Membership/role come from the canonical resolver only; a user with no
 * valid canonical membership is reported as `membership: null` (never a
 * defaulted role).
 */
export async function getWorkspaceAccessAction(): Promise<ActionResponse<WorkspaceAccessState>> {
  if (!isSupabaseConfigured) return actionFailure('Supabase public configuration is unavailable.')
  try {
    const authz = await resolveCanonicalAuthz()
    if (!authz.actor) return actionSuccess({ authenticated: false })
    const user = { id: authz.actor.id, email: authz.actor.email, fullName: authz.actor.fullName }
    if (!authz.ok) {
      if (authz.reason === 'NO_MEMBERSHIP') return actionSuccess({ authenticated: true, user, membership: null })
      return actionFailure(denyMessage(authz.reason))
    }
    return actionSuccess({ authenticated: true, user, membership: { organizationId: authz.membership.organizationId, roleCode: authz.membership.roleCode } })
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

/**
 * Creates the caller's first workspace and its canonical `owner` membership.
 *
 * Provisioning writes ONLY the canonical `memberships` table (the
 * `bootstrap_organization` RPC was re-pointed at it; it no longer writes
 * `organization_memberships` / `roles` for authorization-bearing state).
 */
export async function bootstrapWorkspaceAction(input: z.input<typeof bootstrapSchema>): Promise<ActionResponse<{ organizationId: string; organizationName: string; organizationSlug: string; roleCode: string }>> {
  const parsed = bootstrapSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  if (!isSupabaseConfigured) return actionFailure('Supabase public configuration is unavailable.')
  try {
    const authz = await resolveCanonicalAuthz()
    if (!authz.actor) return actionFailure('Authentication is required to create your first workspace.')
    if (authz.ok) return actionFailure('The current user already has an active organization membership.')
    if (authz.reason !== 'NO_MEMBERSHIP') return actionFailure(denyMessage(authz.reason))

    // SECURITY DEFINER RPC — provisions the organization and the caller's
    // canonical `memberships` row (role = owner). See migration
    // 20260906000100_canonical_membership_authz.sql.
    const supabase = await createServerSupabaseClient()
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
