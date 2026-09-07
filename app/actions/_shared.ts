import 'server-only'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isSupabaseConfigured } from '@/src/lib/supabase'
import { resolveCanonicalAuthz } from '@/lib/authz/canonical'
import { denyMessage, roleAtLeast, type CanonicalRoleCode, type RbRole } from '@/lib/authz/model'
import type { ActionResponse } from './types'
import { actionFailure } from './types'

export const uuidSchema = z.string().uuid()
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD).')
export const isoDateTimeSchema = z.string().datetime({ offset: true }).or(z.string().datetime())

/**
 * Authorization context handed to every server action.
 *
 * Produced exclusively by the canonical resolver (`lib/authz/canonical.ts`):
 * `roleCode` is the exact `memberships.role` value and `role` its RBAC tier.
 * Actions must never re-derive either from the database or from input.
 */
export type AuthorizedContext = {
  userId: string
  organizationId: string
  roleCode: CanonicalRoleCode
  role: RbRole
}

export type ActionScope = 'employee' | 'recruitment' | 'payroll' | 'admin'

/** Minimum canonical tier per action scope. */
const SCOPE_MIN_ROLE: Record<ActionScope, RbRole> = {
  employee: 'EMPLOYEE',
  recruitment: 'HR_ADMIN',
  payroll: 'HR_ADMIN',
  admin: 'HR_ADMIN'
}

/** True when the context holds an HR_ADMIN-or-higher canonical role. */
export function isPrivileged(ctx: Pick<AuthorizedContext, 'role'>): boolean {
  return roleAtLeast(ctx.role, 'HR_ADMIN')
}

export async function requireOrganizationContext(scope: ActionScope = 'employee'): Promise<ActionResponse<AuthorizedContext>> {
  if (!isSupabaseConfigured) return actionFailure('Supabase is not configured. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before invoking server actions.')

  try {
    const authz = await resolveCanonicalAuthz()
    if (!authz.ok) return actionFailure(denyMessage(authz.reason))

    const { membership } = authz
    if (!roleAtLeast(membership.role, SCOPE_MIN_ROLE[scope])) {
      return actionFailure(`The ${membership.roleCode} role is not authorized for this ${scope} action.`)
    }
    return {
      success: true,
      data: {
        userId: membership.userId,
        organizationId: membership.organizationId,
        roleCode: membership.roleCode,
        role: membership.role
      }
    }
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
