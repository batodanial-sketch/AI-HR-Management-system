import 'server-only'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServerSupabaseClient, isSupabaseConfigured, type OrganizationMembershipRow, type RoleRow } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure } from './types'

export const uuidSchema = z.string().uuid()
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD).')
export const isoDateTimeSchema = z.string().datetime({ offset: true }).or(z.string().datetime())

export type AuthorizedContext = {
  userId: string
  organizationId: string
  roleCode: string
}

const privilegedRoleCodes = new Set(['owner', 'admin', 'hr_admin', 'hr_manager', 'system_admin'])
const recruitmentRoleCodes = new Set([...privilegedRoleCodes, 'recruiter', 'talent_acquisition'])
const payrollRoleCodes = new Set([...privilegedRoleCodes, 'finance_admin', 'payroll_admin'])

export async function requireOrganizationContext(scope: 'employee' | 'recruitment' | 'payroll' | 'admin' = 'employee'): Promise<ActionResponse<AuthorizedContext>> {
  if (!isSupabaseConfigured) return actionFailure('Supabase is not configured. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before invoking server actions.')

  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) return actionFailure('Authentication is required for this action.')

    const membershipResult = await supabase
      .from('organization_memberships')
      .select('*')
      .eq('user_id', authData.user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (membershipResult.error || !membershipResult.data) return actionFailure('No active organization membership was found for the current user.')
    const membership = membershipResult.data as OrganizationMembershipRow

    let roleCode = 'member'
    if (membership.role_id) {
      const roleResult = await supabase.from('roles').select('*').eq('id', membership.role_id).maybeSingle()
      if (roleResult.error) return actionFailure(`Unable to resolve organization role: ${roleResult.error.message}`)
      roleCode = ((roleResult.data as RoleRow | null)?.code || 'member').toLowerCase()
    }

    const permitted = scope === 'admin'
      ? privilegedRoleCodes.has(roleCode)
      : scope === 'recruitment'
        ? recruitmentRoleCodes.has(roleCode)
        : scope === 'payroll'
          ? payrollRoleCodes.has(roleCode)
          : true

    if (!permitted) return actionFailure(`The ${roleCode} role is not authorized for this ${scope} action.`)
    return { success: true, data: { userId: authData.user.id, organizationId: membership.organization_id, roleCode } }
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to validate organization authorization.')
  }
}

export function revalidateWorkspacePaths(...paths: string[]) {
  paths.forEach(path => revalidatePath(path))
}

export function validationFailure<T>(error: z.ZodError): ActionResponse<T> {
  return actionFailure(error.issues.map(issue => issue.message).join(' '))
}
