import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient, type Database, type OrganizationMembershipRow, type RoleRow } from '@/src/lib/supabase'
import { enqueuePythonJob, type PythonJobType } from '@/src/lib/pythonBridge'

export type CopilotRoleCode = string
export type CopilotToolName = 'search_employee' | 'update_employee_status' | 'trigger_ai_screening' | 'manage_leave_request' | 'dispatch_python_job'

export type CopilotToolContext = {
  supabase: SupabaseClient<Database>
  userId: string
  organizationId: string
  roleCode: CopilotRoleCode
}

export type CopilotToolResult = {
  success: boolean
  tool: CopilotToolName
  data?: Record<string, unknown>
  error?: string
}

/** Row shape returned by the `search_employee` employee query. */
type EmployeeSearchRow = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  work_email: string;
  status: string;
  department_id: string | null;
  job_title_id: string | null;
  location_id: string | null;
};

export type CopilotToolDefinition<TSchema extends z.ZodTypeAny> = {
  name: CopilotToolName
  description: string
  requiresConfirmation: boolean
  schema: TSchema
  declaration: {
    type: 'function'
    function: {
      name: CopilotToolName
      description: string
      parameters: Record<string, unknown>
    }
  }
  execute: (context: CopilotToolContext, input: z.output<TSchema>) => Promise<CopilotToolResult>
}

const privilegedRoles = new Set(['owner', 'admin', 'hr_admin', 'hr_manager', 'system_admin'])
const recruitmentRoles = new Set([...privilegedRoles, 'recruiter', 'talent_acquisition'])

function canManageEmployees(roleCode: string) {
  return privilegedRoles.has(roleCode)
}

function canManageRecruitment(roleCode: string) {
  return recruitmentRoles.has(roleCode)
}

function canManageLeave(roleCode: string) {
  return privilegedRoles.has(roleCode)
}

async function writeSystemAudit(context: CopilotToolContext, action: 'read' | 'update' | 'approve' | 'reject' | 'generate', entityType: string, entityId: string | null, afterState: Record<string, unknown>) {
  const { error } = await context.supabase.from('audit_logs').insert({
    organization_id: context.organizationId,
    actor_user_id: context.userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_state: null,
    after_state: afterState
  })
  if (error) throw new Error(`Unable to write system audit log: ${error.message}`)
}

function textSearchPattern(query: string) {
  return query.replace(/[%_,()]/g, ' ').trim().slice(0, 80)
}

const searchEmployeeSchema = z.object({
  query: z.string().max(80).optional().default(''),
  department: z.string().max(120).optional(),
  status: z.enum(['active', 'on_leave', 'probation', 'notice_period', 'terminated', 'archived']).optional(),
  limit: z.number().int().min(1).max(25).optional().default(10)
})

const updateEmployeeSchema = z.object({
  employeeId: z.string().uuid(),
  status: z.enum(['active', 'on_leave', 'probation', 'notice_period', 'terminated', 'archived']).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  jobTitleId: z.string().uuid().nullable().optional()
}).refine(value => value.status !== undefined || value.departmentId !== undefined || value.jobTitleId !== undefined, { message: 'At least one employee field must be supplied.' })

const screeningSchema = z.object({
  applicationId: z.string().uuid(),
  resumeText: z.string().min(30).max(70000),
  jobContext: z.record(z.string(), z.unknown())
})

const leaveSchema = z.object({
  action: z.enum(['list_pending', 'approve', 'reject']),
  leaveRequestId: z.string().uuid().optional(),
  approverNote: z.string().max(1000).optional()
}).refine(value => value.action === 'list_pending' || Boolean(value.leaveRequestId), { message: 'leaveRequestId is required for approve or reject actions.' })

const pythonJobSchema = z.object({
  taskType: z.enum(['ai_assessment', 'scrape', 'workflow']),
  payload: z.record(z.string(), z.unknown())
})

async function runSearchEmployee(context: CopilotToolContext, input: z.output<typeof searchEmployeeSchema>): Promise<CopilotToolResult> {
  let query = context.supabase.from('employees').select('id,employee_number,first_name,last_name,work_email,status,department_id,job_title_id,location_id').eq('organization_id', context.organizationId).is('deleted_at', null).limit(input.limit)
  if (input.status) query = query.eq('status', input.status)
  const { data: employeeRows, error } = await query
  if (error) return { success: false, tool: 'search_employee', error: error.message }
  const raw = employeeRows || []
  const normalizedQuery = textSearchPattern(input.query).toLowerCase()
  const [departmentsResult, titlesResult] = await Promise.all([
    context.supabase.from('departments').select('id,name').eq('organization_id', context.organizationId),
    context.supabase.from('job_titles').select('id,name').eq('organization_id', context.organizationId)
  ])
  if (departmentsResult.error || titlesResult.error) return { success: false, tool: 'search_employee', error: departmentsResult.error?.message || titlesResult.error?.message || 'Unable to resolve employee relations.' }
  const departments = new Map((departmentsResult.data || []).map((row: { id: string; name: string }) => [row.id, row.name]))
  const titles = new Map((titlesResult.data || []).map((row: { id: string; name: string }) => [row.id, row.name]))
  const matches = raw.map((row: EmployeeSearchRow) => ({
    id: row.id,
    employeeNumber: row.employee_number,
    name: `${row.first_name} ${row.last_name}`,
    email: row.work_email,
    status: row.status,
    department: departments.get(row.department_id) || 'Unassigned',
    jobTitle: titles.get(row.job_title_id) || 'Unassigned'
  })).filter((employee: { name: string; email: string; department: string; jobTitle: string }) => {
    if (input.department && employee.department.toLowerCase() !== input.department.toLowerCase()) return false
    if (!normalizedQuery) return true
    return `${employee.name} ${employee.email} ${employee.department} ${employee.jobTitle}`.toLowerCase().includes(normalizedQuery)
  })
  await writeSystemAudit(context, 'read', 'copilot_tool:search_employee', null, { input, result_count: matches.length })
  return { success: true, tool: 'search_employee', data: { employees: matches } }
}

async function runUpdateEmployee(context: CopilotToolContext, input: z.output<typeof updateEmployeeSchema>): Promise<CopilotToolResult> {
  if (!canManageEmployees(context.roleCode)) return { success: false, tool: 'update_employee_status', error: 'Your role is not authorized to update employee status, department, or job title.' }
  const patch: Record<string, unknown> = {}
  if (input.status !== undefined) patch.status = input.status
  if (input.departmentId !== undefined) patch.department_id = input.departmentId
  if (input.jobTitleId !== undefined) patch.job_title_id = input.jobTitleId
  const { data, error } = await context.supabase.from('employees').update(patch).eq('id', input.employeeId).eq('organization_id', context.organizationId).select().single()
  if (error || !data) return { success: false, tool: 'update_employee_status', error: error?.message || 'Employee update returned no record.' }
  await writeSystemAudit(context, 'update', 'copilot_tool:update_employee_status', input.employeeId, { patch })
  return { success: true, tool: 'update_employee_status', data: { employee: data } }
}

async function runScreening(context: CopilotToolContext, input: z.output<typeof screeningSchema>): Promise<CopilotToolResult> {
  if (!canManageRecruitment(context.roleCode)) return { success: false, tool: 'trigger_ai_screening', error: 'Your role is not authorized to trigger AI screening.' }
  const { data: application, error } = await context.supabase.from('applications').select('id,candidate_id,job_opening_id').eq('id', input.applicationId).eq('organization_id', context.organizationId).maybeSingle()
  if (error || !application) return { success: false, tool: 'trigger_ai_screening', error: error?.message || 'Application was not found.' }
  const job = await enqueuePythonJob('ai_assessment', {
    organizationId: context.organizationId,
    requestedBy: context.userId,
    payload: {
      application_id: application.id,
      candidate_id: application.candidate_id,
      job_opening_id: application.job_opening_id,
      resume_text: input.resumeText,
      job_context: input.jobContext,
      workflow_id: null,
      notification_title: 'AI screening job queued'
    }
  })
  if (!job.success) return { success: false, tool: 'trigger_ai_screening', error: job.error }
  await writeSystemAudit(context, 'generate', 'copilot_tool:trigger_ai_screening', input.applicationId, { python_job_id: job.data.id })
  return { success: true, tool: 'trigger_ai_screening', data: { jobId: job.data.id, status: job.data.status, applicationId: input.applicationId } }
}

async function runManageLeave(context: CopilotToolContext, input: z.output<typeof leaveSchema>): Promise<CopilotToolResult> {
  if (input.action === 'list_pending') {
    const { data, error } = await context.supabase.from('leave_requests').select('*').eq('organization_id', context.organizationId).eq('status', 'pending').order('created_at', { ascending: true }).limit(30)
    if (error) return { success: false, tool: 'manage_leave_request', error: error.message }
    await writeSystemAudit(context, 'read', 'copilot_tool:manage_leave_request', null, { action: input.action, result_count: (data || []).length })
    return { success: true, tool: 'manage_leave_request', data: { leaveRequests: data || [] } }
  }
  if (!canManageLeave(context.roleCode)) return { success: false, tool: 'manage_leave_request', error: 'Your role is not authorized to approve or reject leave requests.' }
  const { data: request, error: lookupError } = await context.supabase.from('leave_requests').select('*').eq('id', input.leaveRequestId).eq('organization_id', context.organizationId).maybeSingle()
  if (lookupError || !request) return { success: false, tool: 'manage_leave_request', error: lookupError?.message || 'Leave request was not found.' }
  const nextStatus = input.action === 'approve' ? 'approved' : 'rejected'
  let balanceUpdate: Record<string, unknown> | null = null
  if (nextStatus === 'approved') {
    const balanceYear = new Date(request.start_date).getUTCFullYear()
    const { data: balance, error: balanceError } = await context.supabase.from('leave_balances').select('*').eq('organization_id', context.organizationId).eq('employee_id', request.employee_id).eq('leave_type_id', request.leave_type_id).eq('balance_year', balanceYear).maybeSingle()
    if (balanceError || !balance) return { success: false, tool: 'manage_leave_request', error: balanceError?.message || 'Leave balance was not found for this request.' }
    const nextUsedDays = Number(balance.used_days) + Number(request.total_days)
    const allowance = Number(balance.opening_days) + Number(balance.accrued_days) + Number(balance.carried_days)
    if (nextUsedDays > allowance) return { success: false, tool: 'manage_leave_request', error: 'Leave approval would exceed the available balance.' }
    const { error: balanceWriteError } = await context.supabase.from('leave_balances').update({ used_days: nextUsedDays, updated_at: new Date().toISOString() }).eq('id', balance.id)
    if (balanceWriteError) return { success: false, tool: 'manage_leave_request', error: `Leave balance update failed: ${balanceWriteError.message}` }
    const start = new Date(`${request.start_date}T12:00:00Z`)
    const end = new Date(`${request.end_date}T12:00:00Z`)
    const attendanceRows: Array<Record<string, unknown>> = []
    for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      attendanceRows.push({ organization_id: context.organizationId, employee_id: request.employee_id, work_date: date.toISOString().slice(0, 10), status: 'on_leave', source: 'leave_approval', worked_minutes: 0, overtime_minutes: 0 })
    }
    const { error: attendanceError } = await context.supabase.from('attendance_records').upsert(attendanceRows, { onConflict: 'employee_id,work_date' })
    if (attendanceError) return { success: false, tool: 'manage_leave_request', error: `Leave balance was updated but attendance marking failed: ${attendanceError.message}` }
    balanceUpdate = { balance_year: balanceYear, used_days: nextUsedDays, remaining_days: allowance - nextUsedDays, attendance_days_marked: attendanceRows.length }
  }
  const { data, error } = await context.supabase.from('leave_requests').update({ status: nextStatus, approver_id: context.userId, approver_note: input.approverNote || null, decided_at: new Date().toISOString() }).eq('id', request.id).select().single()
  if (error || !data) return { success: false, tool: 'manage_leave_request', error: error?.message || 'Leave request update returned no record.' }
  await writeSystemAudit(context, input.action === 'approve' ? 'approve' : 'reject', 'copilot_tool:manage_leave_request', request.id, { status: nextStatus, approver_note: input.approverNote || null, balance: balanceUpdate })
  return { success: true, tool: 'manage_leave_request', data: { leaveRequest: data, balance: balanceUpdate } }
}

async function runPythonJob(context: CopilotToolContext, input: z.output<typeof pythonJobSchema>): Promise<CopilotToolResult> {
  if (!canManageRecruitment(context.roleCode)) return { success: false, tool: 'dispatch_python_job', error: 'Your role is not authorized to dispatch Python bridge jobs.' }
  const job = await enqueuePythonJob(input.taskType as PythonJobType, { organizationId: context.organizationId, requestedBy: context.userId, payload: input.payload })
  if (!job.success) return { success: false, tool: 'dispatch_python_job', error: job.error }
  await writeSystemAudit(context, 'generate', 'copilot_tool:dispatch_python_job', job.data.id, { task_type: input.taskType, payload: input.payload })
  return { success: true, tool: 'dispatch_python_job', data: { jobId: job.data.id, status: job.data.status, taskType: input.taskType } }
}

export const copilotTools: Record<CopilotToolName, CopilotToolDefinition<z.ZodTypeAny>> = {
  search_employee: {
    name: 'search_employee',
    description: 'Search the authenticated organization employee directory by name, role, department, or operational status.',
    requiresConfirmation: false,
    schema: searchEmployeeSchema,
    declaration: {
      type: 'function',
      function: {
        name: 'search_employee',
        description: 'Search employees using current organization records.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            department: { type: 'string' },
            status: { type: 'string', enum: ['active', 'on_leave', 'probation', 'notice_period', 'terminated', 'archived'] },
            limit: { type: 'integer', minimum: 1, maximum: 25 }
          }
        }
      }
    },
    execute: runSearchEmployee
  },
  update_employee_status: {
    name: 'update_employee_status',
    description: 'Update an employee operational status, department, or job title. This is a high-impact HR write and requires user confirmation.',
    requiresConfirmation: true,
    schema: updateEmployeeSchema,
    declaration: {
      type: 'function',
      function: {
        name: 'update_employee_status',
        description: 'Update employee status, department, or job title after explicit user confirmation.',
        parameters: {
          type: 'object',
          required: ['employeeId'],
          properties: {
            employeeId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['active', 'on_leave', 'probation', 'notice_period', 'terminated', 'archived'] },
            departmentId: { type: ['string', 'null'], format: 'uuid' },
            jobTitleId: { type: ['string', 'null'], format: 'uuid' }
          }
        }
      }
    },
    execute: runUpdateEmployee
  },
  trigger_ai_screening: {
    name: 'trigger_ai_screening',
    description: 'Queue a candidate application for Python-based AI resume screening. Requires explicit confirmation before dispatch.',
    requiresConfirmation: true,
    schema: screeningSchema,
    declaration: {
      type: 'function',
      function: {
        name: 'trigger_ai_screening',
        description: 'Queue AI screening for an application after explicit confirmation.',
        parameters: {
          type: 'object',
          required: ['applicationId', 'resumeText', 'jobContext'],
          properties: {
            applicationId: { type: 'string', format: 'uuid' },
            resumeText: { type: 'string' },
            jobContext: { type: 'object' }
          }
        }
      }
    },
    execute: runScreening
  },
  manage_leave_request: {
    name: 'manage_leave_request',
    description: 'List pending leave requests or approve/reject a selected request. Approval and rejection require explicit confirmation.',
    requiresConfirmation: true,
    schema: leaveSchema,
    declaration: {
      type: 'function',
      function: {
        name: 'manage_leave_request',
        description: 'List, approve, or reject leave requests. Writes require explicit confirmation.',
        parameters: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['list_pending', 'approve', 'reject'] },
            leaveRequestId: { type: 'string', format: 'uuid' },
            approverNote: { type: 'string' }
          }
        }
      }
    },
    execute: runManageLeave
  },
  dispatch_python_job: {
    name: 'dispatch_python_job',
    description: 'Dispatch an authorized background AI assessment, allowlisted scrape, or workflow job to server.py. Requires explicit confirmation.',
    requiresConfirmation: true,
    schema: pythonJobSchema,
    declaration: {
      type: 'function',
      function: {
        name: 'dispatch_python_job',
        description: 'Dispatch a background Python bridge job after explicit confirmation.',
        parameters: {
          type: 'object',
          required: ['taskType', 'payload'],
          properties: {
            taskType: { type: 'string', enum: ['ai_assessment', 'scrape', 'workflow'] },
            payload: { type: 'object' }
          }
        }
      }
    },
    execute: runPythonJob
  }
}

export const copilotToolDeclarations = Object.values(copilotTools).map(tool => tool.declaration)

export function getCopilotTool(name: string) {
  return (copilotTools as Record<string, CopilotToolDefinition<z.ZodTypeAny> | undefined>)[name]
}

export async function resolveCopilotToolContext(): Promise<{ success: true; data: CopilotToolContext } | { success: false; error: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) return { success: false, error: 'Unauthorized. Sign in before executing Copilot tools.' }
    const { data: membership, error: membershipError } = await supabase.from('organization_memberships').select('*').eq('user_id', authData.user.id).eq('status', 'active').limit(1).maybeSingle()
    if (membershipError || !membership) return { success: false, error: 'No active organization membership was found.' }
    const typedMembership = membership as OrganizationMembershipRow
    let roleCode = 'member'
    if (typedMembership.role_id) {
      const { data: role, error: roleError } = await supabase.from('roles').select('*').eq('id', typedMembership.role_id).maybeSingle()
      if (roleError) return { success: false, error: roleError.message }
      roleCode = ((role as RoleRow | null)?.code || 'member').toLowerCase()
    }
    return { success: true, data: { supabase, userId: authData.user.id, organizationId: typedMembership.organization_id, roleCode } }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to resolve Copilot tool context.' }
  }
}
