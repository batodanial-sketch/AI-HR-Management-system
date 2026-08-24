'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import { enqueuePythonJob } from '@/src/lib/pythonBridge'
import { createServerSupabaseClient, type WorkflowRow, type WorkflowRunRow } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const jsonRecord = z.record(z.string(), z.unknown())

const createWorkflowSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(4000).optional().nullable(),
  triggerType: z.string().min(2).max(120),
  triggerConfig: jsonRecord.default({}),
  actions: z.array(jsonRecord).min(1).max(50),
  status: z.enum(['active', 'paused', 'archived']).default('active')
})

const updateWorkflowStatusSchema = z.object({
  workflowId: uuidSchema,
  status: z.enum(['active', 'paused', 'archived'])
})

const runWorkflowSchema = z.object({
  workflowId: uuidSchema,
  triggerPayload: jsonRecord.default({})
})

export type WorkflowOverview = {
  workflows: WorkflowRow[]
  runs: WorkflowRunRow[]
}

export async function getWorkflowOverviewAction(): Promise<ActionResponse<WorkflowOverview>> {
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const [workflowsResult, runsResult] = await Promise.all([
      supabase.from('workflows').select('*').eq('organization_id', auth.data.organizationId).order('updated_at', { ascending: false }),
      supabase.from('workflow_runs').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }).limit(200)
    ])
    const error = workflowsResult.error || runsResult.error
    if (error) return actionFailure(error.message)
    return actionSuccess({ workflows: (workflowsResult.data || []) as WorkflowRow[], runs: (runsResult.data || []) as WorkflowRunRow[] })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load automation records.')
  }
}

export async function createWorkflowAction(input: z.input<typeof createWorkflowSchema>): Promise<ActionResponse<WorkflowRow>> {
  const parsed = createWorkflowSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('workflows').insert({
      organization_id: auth.data.organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      trigger_type: parsed.data.triggerType,
      trigger_config: toJson(parsed.data.triggerConfig),
      actions: toJson(parsed.data.actions),
      status: parsed.data.status,
      created_by: auth.data.userId
    }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Workflow creation returned no record.')
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'create',
      entity_type: 'workflow',
      entity_id: data.id,
      before_state: null,
      after_state: { name: parsed.data.name, trigger_type: parsed.data.triggerType, action_count: parsed.data.actions.length, status: parsed.data.status }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as WorkflowRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create workflow.')
  }
}

export async function updateWorkflowStatusAction(input: z.input<typeof updateWorkflowStatusSchema>): Promise<ActionResponse<WorkflowRow>> {
  const parsed = updateWorkflowStatusSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data: workflow, error: lookupError } = await supabase.from('workflows').select('*').eq('id', parsed.data.workflowId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (lookupError || !workflow) return actionFailure(lookupError?.message || 'Workflow was not found.')
    const { data, error } = await supabase.from('workflows').update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq('id', workflow.id).select().single()
    if (error || !data) return actionFailure(error?.message || 'Workflow status update returned no record.')
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'update',
      entity_type: 'workflow',
      entity_id: workflow.id,
      before_state: { status: workflow.status },
      after_state: { status: parsed.data.status }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as WorkflowRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update workflow status.')
  }
}

export async function runWorkflowAction(input: z.input<typeof runWorkflowSchema>): Promise<ActionResponse<WorkflowRunRow>> {
  const parsed = runWorkflowSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data: workflow, error: workflowError } = await supabase.from('workflows').select('*').eq('id', parsed.data.workflowId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (workflowError || !workflow) return actionFailure(workflowError?.message || 'Workflow was not found.')
    if (workflow.status !== 'active') return actionFailure('Only active workflows can be run.')

    const job = await enqueuePythonJob('workflow', {
      organizationId: auth.data.organizationId,
      requestedBy: auth.data.userId,
      payload: {
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        actions: Array.isArray(workflow.actions) ? workflow.actions : [],
        trigger_payload: toJson(parsed.data.triggerPayload)
      }
    })
    if (!job.success) return actionFailure(job.error)

    const { data: run, error: runError } = await supabase.from('workflow_runs').insert({
      organization_id: auth.data.organizationId,
      workflow_id: workflow.id,
      status: 'queued',
      trigger_payload: toJson(parsed.data.triggerPayload),
      output: toJson({ python_job_id: job.data.id }),
      error_message: null,
      started_at: null,
      finished_at: null
    }).select().single()
    if (runError || !run) return actionFailure(runError?.message || 'Python job queued but workflow run persistence failed.')

    await supabase.from('workflows').update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', workflow.id).eq('organization_id', auth.data.organizationId)
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'generate',
      entity_type: 'workflow_run',
      entity_id: run.id,
      before_state: null,
      after_state: { workflow_id: workflow.id, python_job_id: job.data.id, status: 'queued' }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(run as WorkflowRunRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to run workflow.')
  }
}
