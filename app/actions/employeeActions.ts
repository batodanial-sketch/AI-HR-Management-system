'use server'

import { z } from 'zod'
import {
  createServerSupabaseClient,
  type CompensationPackageRow,
  type DepartmentRow,
  type EmployeeRow,
  type JobTitleRow,
  type LocationRow,
  type SupabaseTypedClient
} from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { dateSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'
import { assertSeatCapacity, SeatCapacityError } from '@/lib/seats'

export type EmployeeDirectoryRecord = {
  employee: EmployeeRow
  department: DepartmentRow | null
  jobTitle: JobTitleRow | null
  location: LocationRow | null
  compensation: CompensationPackageRow | null
}

const createEmployeeSchema = z.object({
  employeeNumber: z.string().min(3).max(64),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  preferredName: z.string().max(120).optional().nullable(),
  workEmail: z.string().email(),
  personalEmail: z.string().email().optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
  departmentId: uuidSchema.optional().nullable(),
  jobTitleId: uuidSchema.optional().nullable(),
  managerId: uuidSchema.optional().nullable(),
  locationId: uuidSchema.optional().nullable(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']),
  startDate: dateSchema,
  annualSalary: z.number().nonnegative().optional(),
  currencyCode: z.string().length(3).transform(value => value.toUpperCase()).default('USD')
})

const employeeStatusSchema = z.object({ employeeId: uuidSchema, status: z.enum(['active', 'on_leave', 'probation', 'notice_period', 'terminated', 'archived']) })
const departmentSchema = z.object({ employeeId: uuidSchema, departmentId: uuidSchema.nullable() })
const compensationSchema = z.object({ employeeId: uuidSchema, annualSalary: z.number().nonnegative(), currencyCode: z.string().length(3).transform(value => value.toUpperCase()).default('USD'), effectiveFrom: dateSchema })

type TenantTableName = 'departments' | 'job_titles' | 'employees' | 'locations'

async function tenantRecordExists(supabase: SupabaseTypedClient, table: TenantTableName, organizationId: string, id: string, excludeDeleted = false): Promise<string | null> {
  let query = supabase.from(table).select('id').eq('id', id).eq('organization_id', organizationId)
  if (excludeDeleted) query = query.is('deleted_at', null)
  const { data, error } = await query.maybeSingle()
  if (error) return error.message
  return data ? null : `${table.replaceAll('_', ' ')} was not found in this organization.`
}

async function validateEmployeeAssignments(supabase: SupabaseTypedClient, organizationId: string, input: { departmentId?: string | null; jobTitleId?: string | null; managerId?: string | null; locationId?: string | null }): Promise<string | null> {
  const checks = [
    input.departmentId ? tenantRecordExists(supabase, 'departments', organizationId, input.departmentId) : Promise.resolve(null),
    input.jobTitleId ? tenantRecordExists(supabase, 'job_titles', organizationId, input.jobTitleId) : Promise.resolve(null),
    input.managerId ? tenantRecordExists(supabase, 'employees', organizationId, input.managerId, true) : Promise.resolve(null),
    input.locationId ? tenantRecordExists(supabase, 'locations', organizationId, input.locationId) : Promise.resolve(null)
  ]
  const results = await Promise.all(checks)
  return results.find(Boolean) || null
}

export async function getEmployeesAction(): Promise<ActionResponse<EmployeeDirectoryRecord[]>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [employeesResult, departmentsResult, titlesResult, locationsResult, compensationResult] = await Promise.all([
      supabase.from('employees').select('*').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('departments').select('*').eq('organization_id', auth.data.organizationId),
      supabase.from('job_titles').select('*').eq('organization_id', auth.data.organizationId),
      supabase.from('locations').select('*').eq('organization_id', auth.data.organizationId),
      supabase.from('compensation_packages').select('*').eq('organization_id', auth.data.organizationId).order('effective_from', { ascending: false })
    ])
    const error = employeesResult.error || departmentsResult.error || titlesResult.error || locationsResult.error || compensationResult.error
    if (error) return actionFailure(error.message)
    const departments = (departmentsResult.data || []) as DepartmentRow[]
    const titles = (titlesResult.data || []) as JobTitleRow[]
    const locations = (locationsResult.data || []) as LocationRow[]
    const compensation = (compensationResult.data || []) as CompensationPackageRow[]
    const departmentById = new Map(departments.map(row => [row.id, row]))
    const titleById = new Map(titles.map(row => [row.id, row]))
    const locationById = new Map(locations.map(row => [row.id, row]))
    const compensationByEmployee = new Map<string, CompensationPackageRow>()
    compensation.forEach(row => { if (!compensationByEmployee.has(row.employee_id)) compensationByEmployee.set(row.employee_id, row) })
    return actionSuccess(((employeesResult.data || []) as EmployeeRow[]).map(employee => ({ employee, department: departmentById.get(employee.department_id || '') || null, jobTitle: titleById.get(employee.job_title_id || '') || null, location: locationById.get(employee.location_id || '') || null, compensation: compensationByEmployee.get(employee.id) || null })))
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load employee directory.')
  }
}

export async function createEmployeeAction(input: z.input<typeof createEmployeeSchema>): Promise<ActionResponse<EmployeeRow>> {
  const parsed = createEmployeeSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    // Dynamic seat-capacity re-evaluation: counts live billable seats (system
    // seed accounts excluded) and blocks only a genuine over-capacity insert.
    // Fail-open on lookup errors so capacity plumbing never breaks onboarding.
    try {
      await assertSeatCapacity()
    } catch (error) {
      if (error instanceof SeatCapacityError) {
        return actionFailure(`${error.message} (${error.capacity.available} of ${error.capacity.limit} seats available).`)
      }
      // Non-capacity errors are ignored — never a false 403.
    }
    const supabase = await createServerSupabaseClient()
    const assignmentError = await validateEmployeeAssignments(supabase, auth.data.organizationId, parsed.data)
    if (assignmentError) return actionFailure(assignmentError)
    const payload = parsed.data
    const { data: employee, error: employeeError } = await supabase.from('employees').insert({ organization_id: auth.data.organizationId, employee_number: payload.employeeNumber, first_name: payload.firstName, last_name: payload.lastName, preferred_name: payload.preferredName || null, work_email: payload.workEmail, personal_email: payload.personalEmail || null, phone: payload.phone || null, department_id: payload.departmentId || null, job_title_id: payload.jobTitleId || null, manager_id: payload.managerId || null, location_id: payload.locationId || null, employment_type: payload.employmentType, status: 'active', start_date: payload.startDate, emergency_contact: {}, custom_fields: {} }).select().single()
    if (employeeError || !employee) return actionFailure(employeeError?.message || 'Employee creation returned no record.')
    if (payload.annualSalary !== undefined) {
      const { error: compensationError } = await supabase.from('compensation_packages').insert({ organization_id: auth.data.organizationId, employee_id: employee.id, currency_code: payload.currencyCode, annual_salary: payload.annualSalary, pay_frequency: 'monthly', effective_from: payload.startDate, components: [] })
      if (compensationError) {
        await supabase.from('employees').delete().eq('id', employee.id).eq('organization_id', auth.data.organizationId)
        return actionFailure(`Employee creation was rolled back because compensation creation failed: ${compensationError.message}`)
      }
    }
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'employee', entity_id: employee.id, before_state: null, after_state: { employee_number: payload.employeeNumber, work_email: payload.workEmail, department_id: payload.departmentId || null, annual_salary: payload.annualSalary ?? null } })
    revalidateWorkspacePaths('/', '/employees', '/dashboard')
    return actionSuccess(employee as EmployeeRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create employee.')
  }
}

export async function updateEmployeeStatusAction(input: z.input<typeof employeeStatusSchema>): Promise<ActionResponse<EmployeeRow>> {
  const parsed = employeeStatusSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: existing, error: lookupError } = await supabase.from('employees').select('id,status').eq('id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).is('deleted_at', null).maybeSingle()
    if (lookupError || !existing) return actionFailure(lookupError?.message || 'Employee was not found.')
    const { data, error } = await supabase.from('employees').update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq('id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !data) return actionFailure(error?.message || 'Employee status update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'employee', entity_id: parsed.data.employeeId, before_state: { status: existing.status }, after_state: { status: parsed.data.status } })
    revalidateWorkspacePaths('/', '/employees', '/dashboard')
    return actionSuccess(data as EmployeeRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update employee status.')
  }
}

export async function updateEmployeeDepartmentAction(input: z.input<typeof departmentSchema>): Promise<ActionResponse<EmployeeRow>> {
  const parsed = departmentSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: existing, error: lookupError } = await supabase.from('employees').select('id,department_id').eq('id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).is('deleted_at', null).maybeSingle()
    if (lookupError || !existing) return actionFailure(lookupError?.message || 'Employee was not found.')
    if (parsed.data.departmentId) {
      const departmentError = await tenantRecordExists(supabase, 'departments', auth.data.organizationId, parsed.data.departmentId)
      if (departmentError) return actionFailure(departmentError)
    }
    const { data, error } = await supabase.from('employees').update({ department_id: parsed.data.departmentId, updated_at: new Date().toISOString() }).eq('id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !data) return actionFailure(error?.message || 'Department update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'employee', entity_id: parsed.data.employeeId, before_state: { department_id: existing.department_id }, after_state: { department_id: parsed.data.departmentId } })
    revalidateWorkspacePaths('/', '/employees', '/dashboard')
    return actionSuccess(data as EmployeeRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update employee department.')
  }
}

export async function updateEmployeeCompensationAction(input: z.input<typeof compensationSchema>): Promise<ActionResponse<CompensationPackageRow>> {
  const parsed = compensationSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('payroll')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const employeeError = await tenantRecordExists(supabase, 'employees', auth.data.organizationId, parsed.data.employeeId, true)
    if (employeeError) return actionFailure(employeeError)
    const { data: existing, error: existingError } = await supabase.from('compensation_packages').select('*').eq('employee_id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).order('effective_from', { ascending: false }).limit(1).maybeSingle()
    if (existingError) return actionFailure(existingError.message)
    const payload = { annual_salary: parsed.data.annualSalary, currency_code: parsed.data.currencyCode, effective_from: parsed.data.effectiveFrom, pay_frequency: 'monthly', updated_at: new Date().toISOString() }
    const result = existing ? await supabase.from('compensation_packages').update(payload).eq('id', existing.id).eq('organization_id', auth.data.organizationId).select().single() : await supabase.from('compensation_packages').insert({ organization_id: auth.data.organizationId, employee_id: parsed.data.employeeId, components: [], ...payload }).select().single()
    if (result.error || !result.data) return actionFailure(result.error?.message || 'Compensation update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'compensation_package', entity_id: result.data.id, before_state: existing ? { annual_salary: existing.annual_salary, currency_code: existing.currency_code, effective_from: existing.effective_from } : null, after_state: { employee_id: parsed.data.employeeId, annual_salary: parsed.data.annualSalary, currency_code: parsed.data.currencyCode, effective_from: parsed.data.effectiveFrom } })
    revalidateWorkspacePaths('/', '/employees', '/payroll', '/dashboard')
    return actionSuccess(result.data as CompensationPackageRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update compensation.')
  }
}
