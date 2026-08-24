'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import {
  createServerSupabaseClient,
  type AccessRevocationRecordRow,
  type AssetAssignmentRow,
  type EmployeeRow,
  type OffboardingCaseRow,
  type OffboardingTaskRow,
  type OnboardingDocumentSigningRequestRow,
  type OnboardingEnrollmentRow,
  type OnboardingProgramRow,
  type OnboardingTaskRow,
  type SupabaseTypedClient
} from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { dateSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const privilegedRoleCodes = new Set(['owner', 'admin', 'hr_admin', 'hr_manager', 'system_admin'])

const templateStepSchema = z.object({
  title: z.string().min(2).max(240),
  description: z.string().max(2000).optional().nullable(),
  dueOffsetDays: z.number().int().min(0).max(365).default(0),
  ownerEmployeeId: uuidSchema.optional().nullable()
})

const createProgramSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(4000).optional().nullable(),
  targetDays: z.number().int().min(1).max(365).default(30),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  templateSteps: z.array(templateStepSchema).max(100).default([])
})

const enrollEmployeeSchema = z.object({
  employeeId: uuidSchema,
  programId: uuidSchema,
  managerId: uuidSchema.optional().nullable(),
  buddyId: uuidSchema.optional().nullable(),
  startDate: dateSchema,
  notes: z.string().max(4000).optional().nullable()
})

const updateTaskSchema = z.object({
  taskId: uuidSchema,
  status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'skipped']),
  note: z.string().max(2000).optional().nullable()
})

export type OnboardingOverview = {
  programs: OnboardingProgramRow[]
  enrollments: OnboardingEnrollmentRow[]
  tasks: OnboardingTaskRow[]
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'manager_id' | 'status' | 'start_date'>[]
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

async function getActorEmployeeId(supabase: SupabaseTypedClient, organizationId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  return data.id as string
}

export async function getOnboardingOverviewAction(): Promise<ActionResponse<OnboardingOverview>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const [programsResult, enrollmentsResult, tasksResult, employeesResult] = await Promise.all([
      supabase.from('onboarding_programs').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('onboarding_enrollments').select('*').eq('organization_id', auth.data.organizationId).order('start_date', { ascending: false }),
      supabase.from('onboarding_tasks').select('*').eq('organization_id', auth.data.organizationId).order('sort_order'),
      supabase.from('employees').select('id,first_name,last_name,manager_id,status,start_date').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name')
    ])
    const error = programsResult.error || enrollmentsResult.error || tasksResult.error || employeesResult.error
    if (error) return actionFailure(error.message)
    return actionSuccess({
      programs: (programsResult.data || []) as OnboardingProgramRow[],
      enrollments: (enrollmentsResult.data || []) as OnboardingEnrollmentRow[],
      tasks: (tasksResult.data || []) as OnboardingTaskRow[],
      employees: (employeesResult.data || []) as OnboardingOverview['employees']
    })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load onboarding records.')
  }
}

export async function createOnboardingProgramAction(input: z.input<typeof createProgramSchema>): Promise<ActionResponse<OnboardingProgramRow>> {
  const parsed = createProgramSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    if (parsed.data.isDefault) {
      const { error: defaultError } = await supabase
        .from('onboarding_programs')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('organization_id', auth.data.organizationId)
        .eq('is_default', true)
      if (defaultError) return actionFailure(defaultError.message)
    }

    const { data, error } = await supabase.from('onboarding_programs').insert({
      organization_id: auth.data.organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      target_days: parsed.data.targetDays,
      is_default: parsed.data.isDefault,
      is_active: parsed.data.isActive,
      template_steps: parsed.data.templateSteps,
      created_by: auth.data.userId
    }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Onboarding program creation returned no record.')

    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'create',
      entity_type: 'onboarding_program',
      entity_id: data.id,
      before_state: null,
      after_state: { name: parsed.data.name, target_days: parsed.data.targetDays, template_step_count: parsed.data.templateSteps.length }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as OnboardingProgramRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create onboarding program.')
  }
}

export async function enrollEmployeeOnboardingAction(input: z.input<typeof enrollEmployeeSchema>): Promise<ActionResponse<{ enrollment: OnboardingEnrollmentRow; tasks: OnboardingTaskRow[] }>> {
  const parsed = enrollEmployeeSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const [employeeResult, programResult] = await Promise.all([
      supabase.from('employees').select('id,manager_id').eq('id', parsed.data.employeeId).eq('organization_id', auth.data.organizationId).is('deleted_at', null).maybeSingle(),
      supabase.from('onboarding_programs').select('*').eq('id', parsed.data.programId).eq('organization_id', auth.data.organizationId).eq('is_active', true).maybeSingle()
    ])
    const lookupError = employeeResult.error || programResult.error
    if (lookupError) return actionFailure(lookupError.message)
    if (!employeeResult.data || !programResult.data) return actionFailure('The selected employee or active onboarding program was not found.')
    const program = programResult.data as OnboardingProgramRow

    for (const personId of [parsed.data.managerId, parsed.data.buddyId]) {
      if (!personId) continue
      const { data: person, error: personError } = await supabase.from('employees').select('id').eq('id', personId).eq('organization_id', auth.data.organizationId).is('deleted_at', null).maybeSingle()
      if (personError || !person) return actionFailure(personError?.message || 'Selected onboarding manager or buddy was not found.')
    }

    const targetCompletionDate = addDays(parsed.data.startDate, program.target_days)
    const { data: enrollment, error: enrollmentError } = await supabase.from('onboarding_enrollments').insert({
      organization_id: auth.data.organizationId,
      employee_id: parsed.data.employeeId,
      program_id: program.id,
      manager_id: parsed.data.managerId || employeeResult.data.manager_id || null,
      buddy_id: parsed.data.buddyId || null,
      start_date: parsed.data.startDate,
      target_completion_date: targetCompletionDate,
      status: 'in_progress',
      progress_percent: 0,
      notes: parsed.data.notes || null
    }).select().single()
    if (enrollmentError || !enrollment) return actionFailure(enrollmentError?.message || 'Onboarding enrollment creation returned no record.')

    const rawSteps = Array.isArray(program.template_steps) ? program.template_steps : []
    const steps = rawSteps.map(value => templateStepSchema.safeParse(value)).filter((result): result is z.ZodSafeParseSuccess<z.infer<typeof templateStepSchema>> => result.success).map(result => result.data)
    let tasks: OnboardingTaskRow[] = []
    if (steps.length) {
      const taskRows = steps.map((step, index) => ({
        organization_id: auth.data.organizationId,
        enrollment_id: enrollment.id,
        owner_employee_id: step.ownerEmployeeId || null,
        title: step.title,
        description: step.description || null,
        due_date: addDays(parsed.data.startDate, step.dueOffsetDays),
        status: 'not_started',
        sort_order: index,
        metadata: {}
      }))
      const { data: insertedTasks, error: taskError } = await supabase.from('onboarding_tasks').insert(taskRows).select()
      if (taskError) {
        await supabase.from('onboarding_enrollments').delete().eq('id', enrollment.id).eq('organization_id', auth.data.organizationId)
        return actionFailure(`Task creation failed and the enrollment was rolled back: ${taskError.message}`)
      }
      tasks = (insertedTasks || []) as OnboardingTaskRow[]
    }

    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'create',
      entity_type: 'onboarding_enrollment',
      entity_id: enrollment.id,
      before_state: null,
      after_state: { employee_id: parsed.data.employeeId, program_id: program.id, task_count: tasks.length }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess({ enrollment: enrollment as OnboardingEnrollmentRow, tasks })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to enroll employee in onboarding.')
  }
}

export async function updateOnboardingTaskAction(input: z.input<typeof updateTaskSchema>): Promise<ActionResponse<{ task: OnboardingTaskRow; enrollment: OnboardingEnrollmentRow }>> {
  const parsed = updateTaskSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data: task, error: taskError } = await supabase.from('onboarding_tasks').select('*').eq('id', parsed.data.taskId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (taskError || !task) return actionFailure(taskError?.message || 'Onboarding task was not found.')
    const { data: enrollment, error: enrollmentError } = await supabase.from('onboarding_enrollments').select('*').eq('id', task.enrollment_id).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (enrollmentError || !enrollment) return actionFailure(enrollmentError?.message || 'Onboarding enrollment was not found.')

    const actorEmployeeId = await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    const canUpdate = privilegedRoleCodes.has(auth.data.roleCode) || actorEmployeeId === task.owner_employee_id || actorEmployeeId === enrollment.employee_id || actorEmployeeId === enrollment.manager_id
    if (!canUpdate) return actionFailure('You are not authorized to update this onboarding task.')

    const metadata = typeof task.metadata === 'object' && task.metadata !== null && !Array.isArray(task.metadata) ? { ...task.metadata as Record<string, unknown> } : {}
    if (parsed.data.note) metadata.latest_note = parsed.data.note
    const completedAt = parsed.data.status === 'completed' ? new Date().toISOString() : null
    const { data: updatedTask, error: updateError } = await supabase.from('onboarding_tasks').update({ status: parsed.data.status, completed_at: completedAt, metadata: toJson(metadata), updated_at: new Date().toISOString() }).eq('id', task.id).select().single()
    if (updateError || !updatedTask) return actionFailure(updateError?.message || 'Onboarding task update returned no record.')

    const { data: tasks, error: tasksError } = await supabase.from('onboarding_tasks').select('status').eq('enrollment_id', enrollment.id).eq('organization_id', auth.data.organizationId)
    if (tasksError) return actionFailure(`Task updated but progress recalculation failed: ${tasksError.message}`)
    const allTasks = (tasks || []) as Array<{ status: OnboardingTaskRow['status'] }>
    const completedCount = allTasks.filter(item => item.status === 'completed' || item.status === 'skipped').length
    const progressPercent = allTasks.length ? Number(((completedCount / allTasks.length) * 100).toFixed(2)) : 0
    const enrollmentStatus: OnboardingEnrollmentRow['status'] = progressPercent === 100 && allTasks.length > 0 ? 'completed' : progressPercent > 0 || parsed.data.status === 'in_progress' ? 'in_progress' : enrollment.status
    const { data: updatedEnrollment, error: enrollmentWriteError } = await supabase.from('onboarding_enrollments').update({ progress_percent: progressPercent, status: enrollmentStatus, completed_at: enrollmentStatus === 'completed' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', enrollment.id).select().single()
    if (enrollmentWriteError || !updatedEnrollment) return actionFailure(enrollmentWriteError?.message || 'Onboarding task was updated but enrollment progress could not be persisted.')

    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'update',
      entity_type: 'onboarding_task',
      entity_id: task.id,
      before_state: { status: task.status },
      after_state: { status: parsed.data.status, progress_percent: progressPercent, note: parsed.data.note || null }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess({ task: updatedTask as OnboardingTaskRow, enrollment: updatedEnrollment as OnboardingEnrollmentRow })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update onboarding task.')
  }
}

const signingRequestSchema = z.object({
  enrollmentId: uuidSchema.optional().nullable(),
  documentId: uuidSchema.optional().nullable(),
  employeeId: uuidSchema,
  provider: z.string().min(2).max(100).default('internal'),
  signingUrl: z.string().url().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
})

const createOffboardingSchema = z.object({
  employeeId: uuidSchema,
  effectiveDate: dateSchema,
  reason: z.string().max(4000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  accessSystems: z.array(z.object({ systemName: z.string().min(2).max(160), accountIdentifier: z.string().max(255).optional().nullable() })).max(50).default([])
})

const updateOffboardingTaskSchema = z.object({ taskId: uuidSchema, status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'skipped']) })
const exitInterviewSchema = z.object({ caseId: uuidSchema, themes: z.array(z.string().max(300)).max(30).default([]), feedback: z.string().max(12000).optional().nullable(), wouldRehire: z.enum(['yes', 'no', 'not_asked']).default('not_asked') })
const accessRevocationSchema = z.object({ recordId: uuidSchema, status: z.enum(['pending', 'revoked', 'not_applicable', 'failed']), evidence: z.record(z.string(), z.unknown()).default({}) })

export type OffboardingOverview = {
  cases: OffboardingCaseRow[]
  tasks: OffboardingTaskRow[]
  accessRecords: AccessRevocationRecordRow[]
  activeAssetAssignments: AssetAssignmentRow[]
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'employee_number' | 'status'>[]
}

export async function requestDocumentSigningAction(input: z.input<typeof signingRequestSchema>): Promise<ActionResponse<OnboardingDocumentSigningRequestRow>> {
  const parsed = signingRequestSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const employeeError = await assertOnboardingEmployee(supabase, auth.data.organizationId, parsed.data.employeeId)
    if (employeeError) return actionFailure(employeeError)
    if (parsed.data.enrollmentId) {
      const { data: enrollment, error } = await supabase.from('onboarding_enrollments').select('id').eq('id', parsed.data.enrollmentId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (error || !enrollment) return actionFailure(error?.message || 'Onboarding enrollment was not found.')
    }
    if (parsed.data.documentId) {
      const { data: document, error } = await supabase.from('documents').select('id').eq('id', parsed.data.documentId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (error || !document) return actionFailure(error?.message || 'Document was not found.')
    }
    const { data, error } = await supabase.from('onboarding_document_signing_requests').insert({ organization_id: auth.data.organizationId, enrollment_id: parsed.data.enrollmentId || null, document_id: parsed.data.documentId || null, employee_id: parsed.data.employeeId, requested_by: auth.data.userId, provider: parsed.data.provider, signing_url: parsed.data.signingUrl || null, expires_at: parsed.data.expiresAt || null, status: parsed.data.signingUrl ? 'sent' : 'pending' }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Document signing request creation returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'onboarding_document_signing_request', entity_id: data.id, before_state: null, after_state: { employee_id: parsed.data.employeeId, provider: parsed.data.provider, status: data.status } })
    revalidateWorkspacePaths('/', '/onboarding')
    return actionSuccess(data as OnboardingDocumentSigningRequestRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create document signing request.')
  }
}

async function assertOnboardingEmployee(supabase: SupabaseTypedClient, organizationId: string, employeeId: string): Promise<string | null> {
  const { data, error } = await supabase.from('employees').select('id').eq('id', employeeId).eq('organization_id', organizationId).is('deleted_at', null).maybeSingle()
  if (error) return error.message
  return data ? null : 'Employee was not found in this organization.'
}

export async function getOffboardingOverviewAction(): Promise<ActionResponse<OffboardingOverview>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [cases, tasks, accessRecords, activeAssetAssignments, employees] = await Promise.all([
      supabase.from('offboarding_cases').select('*').eq('organization_id', auth.data.organizationId).order('effective_date', { ascending: false }),
      supabase.from('offboarding_tasks').select('*').eq('organization_id', auth.data.organizationId).order('sort_order'),
      supabase.from('access_revocation_records').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('asset_assignments').select('*').eq('organization_id', auth.data.organizationId).eq('status', 'assigned'),
      supabase.from('employees').select('id,first_name,last_name,employee_number,status').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name')
    ])
    const error = cases.error || tasks.error || accessRecords.error || activeAssetAssignments.error || employees.error
    if (error) return actionFailure(error.message)
    return actionSuccess({ cases: (cases.data || []) as OffboardingCaseRow[], tasks: (tasks.data || []) as OffboardingTaskRow[], accessRecords: (accessRecords.data || []) as AccessRevocationRecordRow[], activeAssetAssignments: (activeAssetAssignments.data || []) as AssetAssignmentRow[], employees: (employees.data || []) as OffboardingOverview['employees'] })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load offboarding records.')
  }
}

export async function createOffboardingCaseAction(input: z.input<typeof createOffboardingSchema>): Promise<ActionResponse<{ case: OffboardingCaseRow; tasks: OffboardingTaskRow[]; accessRecords: AccessRevocationRecordRow[] }>> {
  const parsed = createOffboardingSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const employeeError = await assertOnboardingEmployee(supabase, auth.data.organizationId, parsed.data.employeeId)
    if (employeeError) return actionFailure(employeeError)
    const { data: offboardingCase, error: caseError } = await supabase.from('offboarding_cases').insert({ organization_id: auth.data.organizationId, employee_id: parsed.data.employeeId, initiated_by: auth.data.userId, effective_date: parsed.data.effectiveDate, reason: parsed.data.reason || null, notes: parsed.data.notes || null, status: 'planned', exit_interview: {} }).select().single()
    if (caseError || !offboardingCase) return actionFailure(caseError?.message || 'Offboarding case creation returned no record.')
    const defaultTasks = [
      { organization_id: auth.data.organizationId, offboarding_case_id: offboardingCase.id, title: 'Collect assigned assets', description: 'Confirm return or disposition of assigned company assets.', due_date: parsed.data.effectiveDate, status: 'not_started', sort_order: 10 },
      { organization_id: auth.data.organizationId, offboarding_case_id: offboardingCase.id, title: 'Revoke system access', description: 'Revoke access according to the organization access register.', due_date: parsed.data.effectiveDate, status: 'not_started', sort_order: 20 },
      { organization_id: auth.data.organizationId, offboarding_case_id: offboardingCase.id, title: 'Complete exit interview', description: 'Capture voluntary exit feedback and required follow-up.', due_date: parsed.data.effectiveDate, status: 'not_started', sort_order: 30 }
    ]
    const { data: tasks, error: taskError } = await supabase.from('offboarding_tasks').insert(defaultTasks).select()
    if (taskError) { await supabase.from('offboarding_cases').delete().eq('id', offboardingCase.id).eq('organization_id', auth.data.organizationId); return actionFailure(`Offboarding case was rolled back: ${taskError.message}`) }
    const { data: accessRecords, error: accessError } = parsed.data.accessSystems.length ? await supabase.from('access_revocation_records').insert(parsed.data.accessSystems.map(system => ({ organization_id: auth.data.organizationId, offboarding_case_id: offboardingCase.id, system_name: system.systemName, account_identifier: system.accountIdentifier || null, status: 'pending', evidence: {} }))).select() : { data: [], error: null }
    if (accessError) return actionFailure(`Offboarding case created but access register creation failed: ${accessError.message}`)
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'offboarding_case', entity_id: offboardingCase.id, before_state: null, after_state: { employee_id: parsed.data.employeeId, effective_date: parsed.data.effectiveDate, task_count: (tasks || []).length } })
    revalidateWorkspacePaths('/', '/offboarding', '/assets')
    return actionSuccess({ case: offboardingCase as OffboardingCaseRow, tasks: (tasks || []) as OffboardingTaskRow[], accessRecords: (accessRecords || []) as AccessRevocationRecordRow[] })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create offboarding case.')
  }
}

export async function updateOffboardingTaskAction(input: z.input<typeof updateOffboardingTaskSchema>): Promise<ActionResponse<OffboardingTaskRow>> {
  const parsed = updateOffboardingTaskSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: task, error } = await supabase.from('offboarding_tasks').update({ status: parsed.data.status, completed_at: parsed.data.status === 'completed' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', parsed.data.taskId).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !task) return actionFailure(error?.message || 'Offboarding task update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'offboarding_task', entity_id: task.id, before_state: null, after_state: { status: parsed.data.status } })
    revalidateWorkspacePaths('/', '/offboarding')
    return actionSuccess(task as OffboardingTaskRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update offboarding task.')
  }
}

export async function saveExitInterviewAction(input: z.input<typeof exitInterviewSchema>): Promise<ActionResponse<OffboardingCaseRow>> {
  const parsed = exitInterviewSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const exitInterview = { themes: parsed.data.themes, feedback: parsed.data.feedback || null, would_rehire: parsed.data.wouldRehire, recorded_by: auth.data.userId, recorded_at: new Date().toISOString() }
    const { data, error } = await supabase.from('offboarding_cases').update({ exit_interview: exitInterview, updated_at: new Date().toISOString() }).eq('id', parsed.data.caseId).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !data) return actionFailure(error?.message || 'Exit interview persistence returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'exit_interview', entity_id: data.id, before_state: null, after_state: { theme_count: parsed.data.themes.length, would_rehire: parsed.data.wouldRehire } })
    revalidateWorkspacePaths('/', '/offboarding')
    return actionSuccess(data as OffboardingCaseRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to save exit interview.')
  }
}

export async function updateAccessRevocationAction(input: z.input<typeof accessRevocationSchema>): Promise<ActionResponse<AccessRevocationRecordRow>> {
  const parsed = accessRevocationSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('access_revocation_records').update({ status: parsed.data.status, evidence: toJson(parsed.data.evidence), revoked_by: parsed.data.status === 'revoked' ? auth.data.userId : null, revoked_at: parsed.data.status === 'revoked' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', parsed.data.recordId).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !data) return actionFailure(error?.message || 'Access revocation update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'access_revocation', entity_id: data.id, before_state: null, after_state: { status: parsed.data.status } })
    revalidateWorkspacePaths('/', '/offboarding')
    return actionSuccess(data as AccessRevocationRecordRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update access revocation.')
  }
}
