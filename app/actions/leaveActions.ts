'use server'

import { z } from 'zod'
import {
  createServerSupabaseClient,
  type EmployeeRow,
  type LeaveBalanceRow,
  type LeaveRequestRow,
  type LeaveTypeRow,
  type SupabaseTypedClient
} from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { dateSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const createLeaveSchema = z.object({
  employeeId: uuidSchema,
  leaveTypeId: uuidSchema,
  startDate: dateSchema,
  endDate: dateSchema,
  halfDay: z.boolean().default(false),
  reason: z.string().max(2000).optional(),
  attachmentKey: z.string().max(500).optional().nullable()
}).refine(value => value.endDate >= value.startDate, { message: 'Leave end date must be on or after start date.' })

const decisionSchema = z.object({
  leaveRequestId: uuidSchema,
  decision: z.enum(['approved', 'rejected']),
  approverNote: z.string().max(1000).optional()
})

const leaveOverviewSchema = z.object({ year: z.number().int().min(2000).max(2200).optional() })

export type LeaveOverview = {
  requests: LeaveRequestRow[]
  types: LeaveTypeRow[]
  balances: LeaveBalanceRow[]
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'manager_id' | 'status'>[]
}

async function getActorEmployeeId(supabase: SupabaseTypedClient, organizationId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('employees').select('id').eq('organization_id', organizationId).eq('user_id', userId).is('deleted_at', null).maybeSingle()
  if (error || !data) return null
  return data.id as string
}

async function applyApprovedLeaveEffects(supabase: SupabaseTypedClient, organizationId: string, request: Pick<LeaveRequestRow, 'employee_id' | 'leave_type_id' | 'start_date' | 'end_date' | 'total_days'>): Promise<string | null> {
  const year = new Date(request.start_date).getUTCFullYear()
  const { data: balance, error: balanceError } = await supabase.from('leave_balances').select('*').eq('organization_id', organizationId).eq('employee_id', request.employee_id).eq('leave_type_id', request.leave_type_id).eq('balance_year', year).maybeSingle()
  if (balanceError || !balance) return balanceError?.message || 'Leave balance was not found.'
  const available = Number(balance.opening_days) + Number(balance.accrued_days) + Number(balance.carried_days) - Number(balance.used_days)
  if (Number(request.total_days) > available) return 'Leave approval would exceed the available balance.'
  const { error: balanceWriteError } = await supabase.from('leave_balances').update({ used_days: Number(balance.used_days) + Number(request.total_days), updated_at: new Date().toISOString() }).eq('id', balance.id).eq('organization_id', organizationId)
  if (balanceWriteError) return balanceWriteError.message
  const start = new Date(`${request.start_date}T12:00:00Z`)
  const end = new Date(`${request.end_date}T12:00:00Z`)
  const attendanceRows: Array<{
    organization_id: string
    employee_id: string
    work_date: string
    status: string
    source: string
    worked_minutes: number
    overtime_minutes: number
  }> = []
  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) attendanceRows.push({ organization_id: organizationId, employee_id: request.employee_id, work_date: date.toISOString().slice(0, 10), status: 'on_leave', source: 'leave_approval', worked_minutes: 0, overtime_minutes: 0 })
  const { error: attendanceError } = await supabase.from('attendance_records').upsert(attendanceRows, { onConflict: 'employee_id,work_date' })
  if (attendanceError) return `Leave balance updated but attendance marking failed: ${attendanceError.message}`
  return null
}

export async function getLeaveRequestsAction(status?: LeaveRequestRow['status']): Promise<ActionResponse<LeaveRequestRow[]>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    let query = supabase.from('leave_requests').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return actionFailure(error.message)
    return actionSuccess((data || []) as LeaveRequestRow[])
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load leave requests.')
  }
}

export async function getLeaveOverviewAction(input: z.input<typeof leaveOverviewSchema> = {}): Promise<ActionResponse<LeaveOverview>> {
  const parsed = leaveOverviewSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const year = parsed.data.year || new Date().getUTCFullYear()
    const [requestsResult, typesResult, balancesResult, employeesResult] = await Promise.all([
      supabase.from('leave_requests').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('leave_types').select('*').eq('organization_id', auth.data.organizationId).order('name'),
      supabase.from('leave_balances').select('*').eq('organization_id', auth.data.organizationId).eq('balance_year', year),
      supabase.from('employees').select('id,first_name,last_name,manager_id,status').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name')
    ])
    const error = requestsResult.error || typesResult.error || balancesResult.error || employeesResult.error
    if (error) return actionFailure(error.message)
    return actionSuccess({
      requests: (requestsResult.data || []) as LeaveRequestRow[],
      types: (typesResult.data || []) as LeaveTypeRow[],
      balances: (balancesResult.data || []) as LeaveBalanceRow[],
      employees: (employeesResult.data || []) as LeaveOverview['employees']
    })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load leave management data.')
  }
}

export async function createLeaveRequestAction(input: z.input<typeof createLeaveSchema>): Promise<ActionResponse<LeaveRequestRow>> {
  const parsed = createLeaveSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const [employeeResult, leaveTypeResult] = await Promise.all([
      supabase.from('employees').select('id,user_id').eq('id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).is('deleted_at', null).maybeSingle(),
      supabase.from('leave_types').select('*').eq('id', parsed.data.leaveTypeId).eq('organization_id', auth.data.organizationId).maybeSingle()
    ])
    const lookupError = employeeResult.error || leaveTypeResult.error
    if (lookupError) return actionFailure(lookupError.message)
    const employee = employeeResult.data as { id: string; user_id: string | null } | null
    const leaveType = leaveTypeResult.data as LeaveTypeRow | null
    if (!employee || !leaveType) return actionFailure('Employee or leave type was not found.')
    if (employee.user_id !== auth.data.userId && !['owner', 'admin', 'hr_admin', 'hr_manager', 'system_admin'].includes(auth.data.roleCode)) return actionFailure('You are not authorized to create leave on behalf of this employee.')
    if (leaveType.requires_attachment && !parsed.data.attachmentKey) return actionFailure('This leave type requires an attachment.')

    const totalDays = Math.floor((new Date(`${parsed.data.endDate}T12:00:00Z`).getTime() - new Date(`${parsed.data.startDate}T12:00:00Z`).getTime()) / 86_400_000) + 1
    const { data, error } = await supabase.from('leave_requests').insert({
      organization_id: auth.data.organizationId,
      employee_id: parsed.data.employeeId,
      leave_type_id: parsed.data.leaveTypeId,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      total_days: parsed.data.halfDay ? 0.5 : totalDays,
      half_day: parsed.data.halfDay,
      reason: parsed.data.reason || null,
      attachment_key: parsed.data.attachmentKey || null,
      status: leaveType.requires_approval ? 'pending' : 'approved',
      approver_id: leaveType.requires_approval ? null : await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId),
      decided_at: leaveType.requires_approval ? null : new Date().toISOString()
    }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Leave request creation returned no record.')
    if (!leaveType.requires_approval) {
      const effectError = await applyApprovedLeaveEffects(supabase, auth.data.organizationId, data as LeaveRequestRow)
      if (effectError) {
        await supabase.from('leave_requests').delete().eq('id', data.id).eq('organization_id', auth.data.organizationId)
        return actionFailure(`Automatic leave approval was rolled back: ${effectError}`)
      }
    }
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'create',
      entity_type: 'leave_request',
      entity_id: data.id,
      before_state: null,
      after_state: { employee_id: parsed.data.employeeId, leave_type_id: parsed.data.leaveTypeId, total_days: parsed.data.halfDay ? 0.5 : totalDays, status: data.status }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as LeaveRequestRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create leave request.')
  }
}

export async function decideLeaveRequestAction(input: z.input<typeof decisionSchema>): Promise<ActionResponse<LeaveRequestRow>> {
  const parsed = decisionSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data: request, error: requestError } = await supabase.from('leave_requests').select('*').eq('id', parsed.data.leaveRequestId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (requestError || !request) return actionFailure(requestError?.message || 'Leave request was not found.')
    if (request.status !== 'pending') return actionFailure('Only pending leave requests can be approved or rejected.')
    const actorEmployeeId = await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    if (!actorEmployeeId) return actionFailure('The current approver does not have an employee record required for leave approval.')

    if (parsed.data.decision === 'approved') {
      const effectError = await applyApprovedLeaveEffects(supabase, auth.data.organizationId, request as LeaveRequestRow)
      if (effectError) return actionFailure(effectError)
    }
    const { data, error } = await supabase.from('leave_requests').update({ status: parsed.data.decision, approver_id: actorEmployeeId, approver_note: parsed.data.approverNote || null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', request.id).select().single()
    if (error || !data) return actionFailure(error?.message || 'Leave decision returned no record.')
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: parsed.data.decision === 'approved' ? 'approve' : 'reject',
      entity_type: 'leave_request',
      entity_id: request.id,
      before_state: { status: 'pending' },
      after_state: { status: parsed.data.decision, note: parsed.data.approverNote || null }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as LeaveRequestRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to decide leave request.')
  }
}
