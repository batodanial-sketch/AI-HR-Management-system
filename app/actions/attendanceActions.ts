'use server'

import { z } from 'zod'
import { createServerSupabaseClient, type AttendanceRecordRow, type EmployeeRow, type SupabaseTypedClient } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { dateSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const clockInSchema = z.object({
  employeeId: uuidSchema,
  workDate: dateSchema,
  checkedInAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  source: z.string().max(80).optional(),
  note: z.string().max(1000).optional()
})

const clockOutSchema = z.object({
  recordId: uuidSchema,
  checkedOutAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  workedMinutes: z.number().int().min(0).max(1440),
  note: z.string().max(1000).optional()
})

const attendanceStatusSchema = z.object({
  recordId: uuidSchema,
  status: z.enum(['present', 'late', 'absent', 'remote', 'holiday', 'on_leave', 'weekend']),
  note: z.string().max(1000).optional()
})

export type AttendanceOverview = {
  records: AttendanceRecordRow[]
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'employee_number' | 'status' | 'user_id'>[]
}

async function getActorEmployeeId(supabase: SupabaseTypedClient, organizationId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('employees').select('id').eq('organization_id', organizationId).eq('user_id', userId).is('deleted_at', null).maybeSingle()
  if (error || !data) return null
  return data.id as string
}

export async function getAttendanceRecordsAction(workDate?: string): Promise<ActionResponse<AttendanceRecordRow[]>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    let query = supabase.from('attendance_records').select('*').eq('organization_id', auth.data.organizationId).order('work_date', { ascending: false })
    if (workDate) {
      const parsedDate = dateSchema.safeParse(workDate)
      if (!parsedDate.success) return validationFailure(parsedDate.error)
      query = query.eq('work_date', parsedDate.data)
    }
    const { data, error } = await query
    if (error) return actionFailure(error.message)
    return actionSuccess((data || []) as AttendanceRecordRow[])
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load attendance records.')
  }
}

export async function getAttendanceOverviewAction(workDate?: string): Promise<ActionResponse<AttendanceOverview>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  if (workDate) {
    const parsed = dateSchema.safeParse(workDate)
    if (!parsed.success) return validationFailure(parsed.error)
  }
  try {
    const supabase = await createServerSupabaseClient()
    let recordQuery = supabase.from('attendance_records').select('*').eq('organization_id', auth.data.organizationId).order('work_date', { ascending: false })
    if (workDate) recordQuery = recordQuery.eq('work_date', workDate)
    const [recordsResult, employeesResult] = await Promise.all([
      recordQuery,
      supabase.from('employees').select('id,first_name,last_name,employee_number,status,user_id').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name')
    ])
    const error = recordsResult.error || employeesResult.error
    if (error) return actionFailure(error.message)
    return actionSuccess({ records: (recordsResult.data || []) as AttendanceRecordRow[], employees: (employeesResult.data || []) as AttendanceOverview['employees'] })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load attendance overview.')
  }
}

export async function clockInAction(input: z.input<typeof clockInSchema>): Promise<ActionResponse<AttendanceRecordRow>> {
  const parsed = clockInSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const actorEmployeeId = await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    if (actorEmployeeId !== parsed.data.employeeId && !['owner', 'admin', 'hr_admin', 'hr_manager', 'system_admin'].includes(auth.data.roleCode)) return actionFailure('You are not authorized to clock in on behalf of this employee.')
    const { data: existing, error: existingError } = await supabase.from('attendance_records').select('*').eq('organization_id', auth.data.organizationId).eq('employee_id', parsed.data.employeeId).eq('work_date', parsed.data.workDate).maybeSingle()
    if (existingError) return actionFailure(existingError.message)
    if (existing) return actionFailure('A time record already exists for this employee and work date.')
    const { data, error } = await supabase.from('attendance_records').insert({ organization_id: auth.data.organizationId, employee_id: parsed.data.employeeId, work_date: parsed.data.workDate, status: 'present', check_in_at: parsed.data.checkedInAt, source: parsed.data.source || 'workspace', note: parsed.data.note || null, worked_minutes: 0, overtime_minutes: 0 }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Clock-in returned no attendance record.')
    await supabase.from('attendance_events').insert({ organization_id: auth.data.organizationId, attendance_record_id: data.id, employee_id: parsed.data.employeeId, event_type: 'clock_in', occurred_at: parsed.data.checkedInAt, metadata: { source: parsed.data.source || 'workspace' } })
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'attendance_record', entity_id: data.id, before_state: null, after_state: { employee_id: parsed.data.employeeId, work_date: parsed.data.workDate, event: 'clock_in' } })
    revalidateWorkspacePaths('/', '/attendance')
    return actionSuccess(data as AttendanceRecordRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to record clock-in.')
  }
}

export async function clockOutAction(input: z.input<typeof clockOutSchema>): Promise<ActionResponse<AttendanceRecordRow>> {
  const parsed = clockOutSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const actorEmployeeId = await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    const { data: record, error: lookupError } = await supabase.from('attendance_records').select('*').eq('id', parsed.data.recordId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (lookupError || !record) return actionFailure(lookupError?.message || 'Attendance record was not found.')
    if (record.employee_id !== actorEmployeeId && !['owner', 'admin', 'hr_admin', 'hr_manager', 'system_admin'].includes(auth.data.roleCode)) return actionFailure('You are not authorized to clock out this employee.')
    if (record.check_out_at) return actionFailure('This attendance record is already checked out.')
    const { data, error } = await supabase.from('attendance_records').update({ check_out_at: parsed.data.checkedOutAt, worked_minutes: parsed.data.workedMinutes, note: parsed.data.note || record.note, updated_at: new Date().toISOString() }).eq('id', record.id).select().single()
    if (error || !data) return actionFailure(error?.message || 'Clock-out returned no attendance record.')
    await supabase.from('attendance_events').insert({ organization_id: auth.data.organizationId, attendance_record_id: data.id, employee_id: record.employee_id, event_type: 'clock_out', occurred_at: parsed.data.checkedOutAt, metadata: { worked_minutes: parsed.data.workedMinutes } })
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'attendance_record', entity_id: data.id, before_state: { check_out_at: null, worked_minutes: record.worked_minutes }, after_state: { check_out_at: parsed.data.checkedOutAt, worked_minutes: parsed.data.workedMinutes, event: 'clock_out' } })
    revalidateWorkspacePaths('/', '/attendance')
    return actionSuccess(data as AttendanceRecordRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to record clock-out.')
  }
}

export async function updateAttendanceStatusAction(input: z.input<typeof attendanceStatusSchema>): Promise<ActionResponse<AttendanceRecordRow>> {
  const parsed = attendanceStatusSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: existing, error: existingError } = await supabase.from('attendance_records').select('*').eq('id', parsed.data.recordId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (existingError || !existing) return actionFailure(existingError?.message || 'Attendance record was not found.')
    const { data, error } = await supabase.from('attendance_records').update({ status: parsed.data.status, note: parsed.data.note || null, approved_by: auth.data.userId, updated_at: new Date().toISOString() }).eq('id', parsed.data.recordId).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !data) return actionFailure(error?.message || 'Attendance status update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'attendance_record', entity_id: existing.id, before_state: { status: existing.status }, after_state: { status: parsed.data.status, note: parsed.data.note || null } })
    revalidateWorkspacePaths('/', '/attendance')
    return actionSuccess(data as AttendanceRecordRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update attendance status.')
  }
}
