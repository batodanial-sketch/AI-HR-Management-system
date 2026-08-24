'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import { getGroqClient } from '@/src/lib/ai/groqClient'
import {
  createServerSupabaseClient,
  type EmployeeRow,
  type FeedbackNoteRow,
  type GoalCheckInRow,
  type GoalRow,
  type PerformanceCalibrationRecordRow,
  type PerformanceCycleRow,
  type PerformanceFeedbackRequestRow,
  type PerformanceFeedbackResponseRow,
  type PerformanceReviewAnswerRow,
  type PerformanceReviewRow,
  type TalentAssessmentRow,
  type SupabaseTypedClient,
  type Database,
} from '@/src/lib/supabase'
import { getPerformanceWorkspace } from '@/src/services/performanceService'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { dateSchema, isoDateTimeSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const privilegedRoleCodes = new Set(['owner', 'admin', 'hr_admin', 'hr_manager', 'system_admin'])
const jsonRecord = z.record(z.string(), z.unknown())
const feedbackQuestionSchema = z.object({ id: z.string().min(1).max(120), prompt: z.string().min(2).max(1000), required: z.boolean().optional(), scale: z.enum(['rating_1_5', 'text']).optional() })

const createCycleSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(5000).optional().nullable(),
  startDate: dateSchema,
  endDate: dateSchema,
  selfReviewDueAt: isoDateTimeSchema.optional().nullable(),
  managerReviewDueAt: isoDateTimeSchema.optional().nullable(),
  calibrationDueAt: isoDateTimeSchema.optional().nullable(),
  status: z.enum(['draft', 'active', 'calibration', 'closed', 'archived']).default('draft'),
  settings: jsonRecord.default({})
}).refine(value => value.endDate >= value.startDate, { message: 'Performance cycle end date must be on or after its start date.' })

const updateCycleSchema = z.object({
  cycleId: uuidSchema,
  name: z.string().min(2).max(180).optional(),
  description: z.string().max(5000).optional().nullable(),
  selfReviewDueAt: isoDateTimeSchema.optional().nullable(),
  managerReviewDueAt: isoDateTimeSchema.optional().nullable(),
  calibrationDueAt: isoDateTimeSchema.optional().nullable(),
  status: z.enum(['draft', 'active', 'calibration', 'closed', 'archived']).optional(),
  settings: jsonRecord.optional()
})

const createGoalSchema = z.object({
  employeeId: uuidSchema,
  performanceCycleId: uuidSchema.optional().nullable(),
  title: z.string().min(2).max(240),
  description: z.string().max(4000).optional().nullable(),
  metricType: z.string().max(120).optional().nullable(),
  targetValue: z.number().finite().optional().nullable(),
  currentValue: z.number().finite().default(0),
  progressPercent: z.number().min(0).max(100).default(0),
  dueDate: dateSchema.optional().nullable(),
  status: z.string().min(2).max(80).default('not_started')
})

const updateGoalSchema = z.object({
  goalId: uuidSchema,
  currentValue: z.number().finite().optional(),
  progressPercent: z.number().min(0).max(100),
  status: z.string().min(2).max(80),
  note: z.string().max(1000).optional().nullable()
})

const goalCheckInSchema = z.object({
  goalId: uuidSchema,
  currentValue: z.number().finite().optional().nullable(),
  progressPercent: z.number().min(0).max(100),
  confidence: z.enum(['on_track', 'needs_attention', 'at_risk']),
  blockers: z.string().max(4000).optional().nullable(),
  nextSteps: z.string().max(4000).optional().nullable()
})

const createReviewSchema = z.object({
  performanceCycleId: uuidSchema,
  employeeId: uuidSchema,
  reviewerId: uuidSchema,
  reviewType: z.string().min(2).max(80),
  overallRating: z.number().min(1).max(5).optional().nullable(),
  summary: z.string().max(12000).optional().nullable(),
  status: z.string().min(2).max(80).default('in_progress')
})

const selfAssessmentSchema = z.object({
  performanceCycleId: uuidSchema,
  employeeId: uuidSchema,
  overallRating: z.number().min(1).max(5).optional().nullable(),
  summary: z.string().max(12000).min(20),
  answers: jsonRecord.default({}),
  status: z.enum(['in_progress', 'submitted']).default('submitted')
})

const feedbackRequestSchema = z.object({
  performanceCycleId: uuidSchema.optional().nullable(),
  performanceReviewId: uuidSchema.optional().nullable(),
  subjectEmployeeId: uuidSchema,
  recipientEmployeeId: uuidSchema.optional().nullable(),
  recipientEmail: z.string().email().optional().nullable(),
  relationship: z.enum(['self', 'manager', 'peer', 'direct_report', 'cross_functional', 'external']).default('peer'),
  visibility: z.enum(['manager_and_hr', 'hr_only', 'subject_after_cycle', 'anonymous_to_subject']).default('manager_and_hr'),
  questions: z.array(feedbackQuestionSchema).min(1).max(30),
  dueAt: isoDateTimeSchema.optional().nullable()
}).refine(value => Boolean(value.recipientEmployeeId || value.recipientEmail), { message: 'A recipient employee or email address is required.' })

const feedbackSubmissionSchema = z.object({
  requestId: uuidSchema,
  overallRating: z.number().min(1).max(5).optional().nullable(),
  answers: jsonRecord.default({}),
  strengths: z.string().max(6000).optional().nullable(),
  growthAreas: z.string().max(6000).optional().nullable()
})

const talentAssessmentSchema = z.object({
  performanceCycleId: uuidSchema,
  employeeId: uuidSchema,
  performanceRating: z.number().min(1).max(5).optional().nullable(),
  potentialRating: z.number().min(1).max(5).optional().nullable(),
  readiness: z.enum(['developing', 'ready_1_2_years', 'ready_now', 'critical_expert']).default('developing'),
  retentionRisk: z.enum(['not_assessed', 'low', 'moderate', 'high']).default('not_assessed'),
  calibrationNote: z.string().max(6000).optional().nullable()
})

const calibrationSchema = z.object({
  performanceCycleId: uuidSchema,
  employeeId: uuidSchema,
  proposedRating: z.number().min(1).max(5).optional().nullable(),
  calibratedRating: z.number().min(1).max(5).optional().nullable(),
  rationale: z.string().max(6000).optional().nullable(),
  calibrationStatus: z.enum(['pending', 'confirmed', 'needs_review']).default('pending')
})

const reviewIdSchema = z.object({ reviewId: uuidSchema })
const generateSummarySchema = reviewIdSchema

export type PerformanceOverview = {
  currentEmployeeId: string | null
  cycles: PerformanceCycleRow[]
  goals: GoalRow[]
  reviews: PerformanceReviewRow[]
  feedback: FeedbackNoteRow[]
  feedbackRequests: PerformanceFeedbackRequestRow[]
  feedbackResponses: PerformanceFeedbackResponseRow[]
  goalCheckIns: GoalCheckInRow[]
  talentAssessments: TalentAssessmentRow[]
  calibrationRecords: PerformanceCalibrationRecordRow[]
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'department_id' | 'job_title_id' | 'status' | 'manager_id'>[]
}

export type PerformanceReviewDetail = {
  review: PerformanceReviewRow
  answers: PerformanceReviewAnswerRow[]
  feedbackRequests: PerformanceFeedbackRequestRow[]
  feedbackResponses: PerformanceFeedbackResponseRow[]
  goals: GoalRow[]
  checkIns: GoalCheckInRow[]
  talentAssessment: TalentAssessmentRow | null
  calibration: PerformanceCalibrationRecordRow | null
}

function revalidatePerformancePaths() {
  revalidateWorkspacePaths('/', '/dashboard', '/performance', '/performance/goals')
}

async function getActorEmployeeId(supabase: SupabaseTypedClient, organizationId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('employees').select('id').eq('organization_id', organizationId).eq('user_id', userId).is('deleted_at', null).maybeSingle()
  if (error || !data) return null
  return data.id as string
}

async function getAuthenticatedEmail(supabase: SupabaseTypedClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.email) return null
  return data.user.email.toLowerCase()
}

async function assertEmployeeInOrganization(supabase: SupabaseTypedClient, organizationId: string, employeeId: string): Promise<string | null> {
  const { data, error } = await supabase.from('employees').select('id').eq('id', employeeId).eq('organization_id', organizationId).is('deleted_at', null).maybeSingle()
  if (error) return error.message
  return data ? null : 'Employee was not found in this organization.'
}

export async function getPerformanceOverviewAction(): Promise<ActionResponse<PerformanceOverview>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [workspace, employeesResult, currentEmployeeId] = await Promise.all([
      getPerformanceWorkspace(supabase, auth.data.organizationId),
      supabase.from('employees').select('id,first_name,last_name,department_id,job_title_id,status,manager_id').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name'),
      getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    ])
    if (employeesResult.error) return actionFailure(employeesResult.error.message)
    return actionSuccess({
      currentEmployeeId,
      cycles: workspace.cycles,
      goals: workspace.goals,
      reviews: workspace.reviews,
      feedback: workspace.feedback,
      feedbackRequests: workspace.feedbackRequests as PerformanceFeedbackRequestRow[],
      feedbackResponses: workspace.feedbackResponses as PerformanceFeedbackResponseRow[],
      goalCheckIns: workspace.goalCheckIns as GoalCheckInRow[],
      talentAssessments: workspace.talentAssessments as TalentAssessmentRow[],
      calibrationRecords: workspace.calibrationRecords as PerformanceCalibrationRecordRow[],
      employees: (employeesResult.data || []) as PerformanceOverview['employees']
    })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load performance records.')
  }
}

export async function createPerformanceCycleAction(input: z.input<typeof createCycleSchema>): Promise<ActionResponse<PerformanceCycleRow>> {
  const parsed = createCycleSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.from('performance_cycles').insert({
      organization_id: auth.data.organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      self_review_due_at: parsed.data.selfReviewDueAt || null,
      manager_review_due_at: parsed.data.managerReviewDueAt || null,
      calibration_due_at: parsed.data.calibrationDueAt || null,
      status: parsed.data.status,
      settings: toJson(parsed.data.settings),
      published_at: parsed.data.status === 'active' ? new Date().toISOString() : null,
      created_by: auth.data.userId
    }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Performance cycle creation returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'performance_cycle', entity_id: data.id, before_state: null, after_state: { name: parsed.data.name, status: parsed.data.status, start_date: parsed.data.startDate, end_date: parsed.data.endDate } })
    revalidatePerformancePaths()
    return actionSuccess(data as PerformanceCycleRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create performance cycle.')
  }
}

export async function updatePerformanceCycleAction(input: z.input<typeof updateCycleSchema>): Promise<ActionResponse<PerformanceCycleRow>> {
  const parsed = updateCycleSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: existing, error: lookupError } = await supabase.from('performance_cycles').select('*').eq('id', parsed.data.cycleId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (lookupError || !existing) return actionFailure(lookupError?.message || 'Performance cycle was not found.')
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (parsed.data.name !== undefined) patch.name = parsed.data.name
    if (parsed.data.description !== undefined) patch.description = parsed.data.description
    if (parsed.data.selfReviewDueAt !== undefined) patch.self_review_due_at = parsed.data.selfReviewDueAt
    if (parsed.data.managerReviewDueAt !== undefined) patch.manager_review_due_at = parsed.data.managerReviewDueAt
    if (parsed.data.calibrationDueAt !== undefined) patch.calibration_due_at = parsed.data.calibrationDueAt
    if (parsed.data.settings !== undefined) patch.settings = parsed.data.settings
    if (parsed.data.status !== undefined) {
      patch.status = parsed.data.status
      if (parsed.data.status === 'active' && !existing.published_at) patch.published_at = new Date().toISOString()
    }
    const { data, error } = await supabase.from('performance_cycles').update(patch as Database['public']['Tables']['performance_cycles']['Update']).eq('id', existing.id).select().single()
    if (error || !data) return actionFailure(error?.message || 'Performance cycle update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'performance_cycle', entity_id: existing.id, before_state: { status: existing.status, name: existing.name }, after_state: toJson(patch) })
    revalidatePerformancePaths()
    return actionSuccess(data as PerformanceCycleRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update performance cycle.')
  }
}

export async function createGoalAction(input: z.input<typeof createGoalSchema>): Promise<ActionResponse<GoalRow>> {
  const parsed = createGoalSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const employeeError = await assertEmployeeInOrganization(supabase, auth.data.organizationId, parsed.data.employeeId)
    if (employeeError) return actionFailure(employeeError)
    if (parsed.data.performanceCycleId) {
      const { data: cycle, error: cycleError } = await supabase.from('performance_cycles').select('id').eq('id', parsed.data.performanceCycleId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (cycleError || !cycle) return actionFailure(cycleError?.message || 'Performance cycle was not found.')
    }
    const { data, error } = await supabase.from('goals').insert({ organization_id: auth.data.organizationId, employee_id: parsed.data.employeeId, performance_cycle_id: parsed.data.performanceCycleId || null, title: parsed.data.title, description: parsed.data.description || null, metric_type: parsed.data.metricType || null, target_value: parsed.data.targetValue ?? null, current_value: parsed.data.currentValue, progress_percent: parsed.data.progressPercent, due_date: parsed.data.dueDate || null, status: parsed.data.status }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Goal creation returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'goal', entity_id: data.id, before_state: null, after_state: { employee_id: parsed.data.employeeId, title: parsed.data.title, progress_percent: parsed.data.progressPercent } })
    revalidatePerformancePaths()
    return actionSuccess(data as GoalRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create goal.')
  }
}

export async function updateGoalProgressAction(input: z.input<typeof updateGoalSchema>): Promise<ActionResponse<GoalRow>> {
  const parsed = updateGoalSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: goal, error: goalError } = await supabase.from('goals').select('*').eq('id', parsed.data.goalId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (goalError || !goal) return actionFailure(goalError?.message || 'Goal was not found.')
    const actorEmployeeId = await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    if (goal.employee_id !== actorEmployeeId && !privilegedRoleCodes.has(auth.data.roleCode)) return actionFailure('You are not authorized to update this employee goal.')
    const patch: Record<string, unknown> = { progress_percent: parsed.data.progressPercent, status: parsed.data.status, updated_at: new Date().toISOString() }
    if (parsed.data.currentValue !== undefined) patch.current_value = parsed.data.currentValue
    const { data, error } = await supabase.from('goals').update(patch as Database['public']['Tables']['goals']['Update']).eq('id', goal.id).select().single()
    if (error || !data) return actionFailure(error?.message || 'Goal update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'goal', entity_id: goal.id, before_state: { progress_percent: goal.progress_percent, status: goal.status, current_value: goal.current_value }, after_state: { ...patch, note: parsed.data.note || null } })
    revalidatePerformancePaths()
    return actionSuccess(data as GoalRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update goal progress.')
  }
}

export async function createGoalCheckInAction(input: z.input<typeof goalCheckInSchema>): Promise<ActionResponse<GoalCheckInRow>> {
  const parsed = goalCheckInSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: goal, error: goalError } = await supabase.from('goals').select('*').eq('id', parsed.data.goalId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (goalError || !goal) return actionFailure(goalError?.message || 'Goal was not found.')
    const actorEmployeeId = await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    if (goal.employee_id !== actorEmployeeId && !privilegedRoleCodes.has(auth.data.roleCode)) return actionFailure('You are not authorized to create a check-in for this goal.')
    const { data, error } = await supabase.from('goal_check_ins').insert({ organization_id: auth.data.organizationId, goal_id: goal.id, employee_id: goal.employee_id, created_by: auth.data.userId, current_value: parsed.data.currentValue ?? goal.current_value, progress_percent: parsed.data.progressPercent, confidence: parsed.data.confidence, blockers: parsed.data.blockers || null, next_steps: parsed.data.nextSteps || null }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Goal check-in creation returned no record.')
    const { error: goalUpdateError } = await supabase.from('goals').update({ current_value: parsed.data.currentValue ?? goal.current_value, progress_percent: parsed.data.progressPercent, status: parsed.data.confidence === 'at_risk' ? 'at_risk' : goal.status === 'completed' ? 'completed' : 'in_progress', updated_at: new Date().toISOString() }).eq('id', goal.id).eq('organization_id', auth.data.organizationId)
    if (goalUpdateError) return actionFailure(`Check-in was saved but goal progress update failed: ${goalUpdateError.message}`)
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'goal_check_in', entity_id: data.id, before_state: null, after_state: { goal_id: goal.id, progress_percent: parsed.data.progressPercent, confidence: parsed.data.confidence } })
    revalidatePerformancePaths()
    return actionSuccess(data as GoalCheckInRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create goal check-in.')
  }
}

export async function createPerformanceReviewAction(input: z.input<typeof createReviewSchema>): Promise<ActionResponse<PerformanceReviewRow>> {
  const parsed = createReviewSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [cycleResult, employeeError, reviewerError] = await Promise.all([
      supabase.from('performance_cycles').select('id').eq('id', parsed.data.performanceCycleId).eq('organization_id', auth.data.organizationId).maybeSingle(),
      assertEmployeeInOrganization(supabase, auth.data.organizationId, parsed.data.employeeId),
      assertEmployeeInOrganization(supabase, auth.data.organizationId, parsed.data.reviewerId)
    ])
    if (cycleResult.error || !cycleResult.data) return actionFailure(cycleResult.error?.message || 'Performance cycle was not found.')
    if (employeeError || reviewerError) return actionFailure(employeeError || reviewerError || 'Employee lookup failed.')
    const { data, error } = await supabase.from('performance_reviews').upsert({ organization_id: auth.data.organizationId, performance_cycle_id: parsed.data.performanceCycleId, employee_id: parsed.data.employeeId, reviewer_id: parsed.data.reviewerId, review_type: parsed.data.reviewType, overall_rating: parsed.data.overallRating ?? null, summary: parsed.data.summary || null, status: parsed.data.status, submitted_at: parsed.data.status === 'submitted' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: 'performance_cycle_id,employee_id,reviewer_id,review_type' }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Performance review persistence returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'performance_review', entity_id: data.id, before_state: null, after_state: { employee_id: parsed.data.employeeId, review_type: parsed.data.reviewType, status: parsed.data.status, overall_rating: parsed.data.overallRating ?? null } })
    revalidatePerformancePaths()
    return actionSuccess(data as PerformanceReviewRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to save performance review.')
  }
}

export async function saveSelfAssessmentAction(input: z.input<typeof selfAssessmentSchema>): Promise<ActionResponse<PerformanceReviewRow>> {
  const parsed = selfAssessmentSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const actorEmployeeId = await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    if (actorEmployeeId !== parsed.data.employeeId && !privilegedRoleCodes.has(auth.data.roleCode)) return actionFailure('You are not authorized to submit this self assessment.')
    const { data: cycle, error: cycleError } = await supabase.from('performance_cycles').select('id').eq('id', parsed.data.performanceCycleId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (cycleError || !cycle) return actionFailure(cycleError?.message || 'Performance cycle was not found.')
    const reviewerId = actorEmployeeId || parsed.data.employeeId
    const { data: review, error: reviewError } = await supabase.from('performance_reviews').upsert({ organization_id: auth.data.organizationId, performance_cycle_id: parsed.data.performanceCycleId, employee_id: parsed.data.employeeId, reviewer_id: reviewerId, review_type: 'self_assessment', overall_rating: parsed.data.overallRating ?? null, summary: parsed.data.summary, status: parsed.data.status, submitted_at: parsed.data.status === 'submitted' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: 'performance_cycle_id,employee_id,reviewer_id,review_type' }).select().single()
    if (reviewError || !review) return actionFailure(reviewError?.message || 'Self assessment persistence returned no record.')
    const answerRows = Object.entries(parsed.data.answers).map(([questionKey, answer]) => ({ organization_id: auth.data.organizationId, performance_review_id: review.id, question_key: questionKey, answer: typeof answer === 'string' ? answer : JSON.stringify(answer), rating: typeof answer === 'number' ? answer : null, updated_at: new Date().toISOString() }))
    if (answerRows.length) {
      const { error: answerError } = await supabase.from('performance_review_answers').upsert(answerRows, { onConflict: 'performance_review_id,question_key' })
      if (answerError) return actionFailure(`Self assessment saved but answer persistence failed: ${answerError.message}`)
    }
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'performance_self_assessment', entity_id: review.id, before_state: null, after_state: { status: parsed.data.status, answer_count: answerRows.length } })
    revalidatePerformancePaths()
    return actionSuccess(review as PerformanceReviewRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to submit self assessment.')
  }
}

export async function createFeedbackRequestAction(input: z.input<typeof feedbackRequestSchema>): Promise<ActionResponse<PerformanceFeedbackRequestRow>> {
  const parsed = feedbackRequestSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const subjectError = await assertEmployeeInOrganization(supabase, auth.data.organizationId, parsed.data.subjectEmployeeId)
    if (subjectError) return actionFailure(subjectError)
    if (parsed.data.recipientEmployeeId) {
      const recipientError = await assertEmployeeInOrganization(supabase, auth.data.organizationId, parsed.data.recipientEmployeeId)
      if (recipientError) return actionFailure(recipientError)
    }
    if (parsed.data.performanceCycleId) {
      const { data: cycle, error: cycleError } = await supabase.from('performance_cycles').select('id').eq('id', parsed.data.performanceCycleId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (cycleError || !cycle) return actionFailure(cycleError?.message || 'Performance cycle was not found.')
    }
    if (parsed.data.performanceReviewId) {
      const { data: review, error: reviewError } = await supabase.from('performance_reviews').select('id').eq('id', parsed.data.performanceReviewId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (reviewError || !review) return actionFailure(reviewError?.message || 'Performance review was not found.')
    }
    const { data, error } = await supabase.from('performance_feedback_requests').insert({ organization_id: auth.data.organizationId, performance_cycle_id: parsed.data.performanceCycleId || null, performance_review_id: parsed.data.performanceReviewId || null, subject_employee_id: parsed.data.subjectEmployeeId, requested_by: auth.data.userId, recipient_employee_id: parsed.data.recipientEmployeeId || null, recipient_email: parsed.data.recipientEmail?.toLowerCase() || null, relationship: parsed.data.relationship, visibility: parsed.data.visibility, questions: parsed.data.questions, due_at: parsed.data.dueAt || null }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Feedback request creation returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'performance_feedback_request', entity_id: data.id, before_state: null, after_state: { subject_employee_id: parsed.data.subjectEmployeeId, relationship: parsed.data.relationship, visibility: parsed.data.visibility } })
    revalidatePerformancePaths()
    return actionSuccess(data as PerformanceFeedbackRequestRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create feedback request.')
  }
}

export async function submit360FeedbackAction(input: z.input<typeof feedbackSubmissionSchema>): Promise<ActionResponse<PerformanceFeedbackResponseRow>> {
  const parsed = feedbackSubmissionSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: request, error: requestError } = await supabase.from('performance_feedback_requests').select('*').eq('id', parsed.data.requestId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (requestError || !request) return actionFailure(requestError?.message || 'Feedback request was not found.')
    if (request.status !== 'pending') return actionFailure('Only pending feedback requests can be submitted.')
    const actorEmployeeId = await getActorEmployeeId(supabase, auth.data.organizationId, auth.data.userId)
    const actorEmail = await getAuthenticatedEmail(supabase)
    const isAssigned = request.recipient_employee_id === actorEmployeeId || (request.recipient_email && actorEmail && request.recipient_email.toLowerCase() === actorEmail)
    if (!isAssigned && !privilegedRoleCodes.has(auth.data.roleCode)) return actionFailure('You are not authorized to submit this feedback request.')
    const { data, error } = await supabase.from('performance_feedback_responses').upsert({ organization_id: auth.data.organizationId, feedback_request_id: request.id, respondent_employee_id: actorEmployeeId || null, respondent_email: actorEmail, overall_rating: parsed.data.overallRating ?? null, answers: toJson(parsed.data.answers), strengths: parsed.data.strengths || null, growth_areas: parsed.data.growthAreas || null, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: actorEmployeeId ? 'feedback_request_id,respondent_employee_id' : 'feedback_request_id,respondent_email' }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Feedback response persistence returned no record.')
    const { error: requestUpdateError } = await supabase.from('performance_feedback_requests').update({ status: 'submitted', updated_at: new Date().toISOString() }).eq('id', request.id).eq('organization_id', auth.data.organizationId)
    if (requestUpdateError) return actionFailure(`Feedback response saved but request status update failed: ${requestUpdateError.message}`)
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'performance_feedback_response', entity_id: data.id, before_state: null, after_state: { feedback_request_id: request.id, relationship: request.relationship } })
    revalidatePerformancePaths()
    return actionSuccess(data as PerformanceFeedbackResponseRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to submit 360 feedback.')
  }
}

export async function updateTalentAssessmentAction(input: z.input<typeof talentAssessmentSchema>): Promise<ActionResponse<TalentAssessmentRow>> {
  const parsed = talentAssessmentSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const employeeError = await assertEmployeeInOrganization(supabase, auth.data.organizationId, parsed.data.employeeId)
    if (employeeError) return actionFailure(employeeError)
    const { data: cycle, error: cycleError } = await supabase.from('performance_cycles').select('id').eq('id', parsed.data.performanceCycleId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (cycleError || !cycle) return actionFailure(cycleError?.message || 'Performance cycle was not found.')
    const { data, error } = await supabase.from('talent_assessments').upsert({ organization_id: auth.data.organizationId, performance_cycle_id: parsed.data.performanceCycleId, employee_id: parsed.data.employeeId, performance_rating: parsed.data.performanceRating ?? null, potential_rating: parsed.data.potentialRating ?? null, readiness: parsed.data.readiness, retention_risk: parsed.data.retentionRisk, calibration_note: parsed.data.calibrationNote || null, assessed_by: auth.data.userId, assessed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'performance_cycle_id,employee_id' }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Talent assessment persistence returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'talent_assessment', entity_id: data.id, before_state: null, after_state: { employee_id: parsed.data.employeeId, performance_rating: parsed.data.performanceRating ?? null, potential_rating: parsed.data.potentialRating ?? null } })
    revalidatePerformancePaths()
    return actionSuccess(data as TalentAssessmentRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update talent assessment.')
  }
}

export async function updateCalibrationRecordAction(input: z.input<typeof calibrationSchema>): Promise<ActionResponse<PerformanceCalibrationRecordRow>> {
  const parsed = calibrationSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const employeeError = await assertEmployeeInOrganization(supabase, auth.data.organizationId, parsed.data.employeeId)
    if (employeeError) return actionFailure(employeeError)
    const { data, error } = await supabase.from('performance_calibration_records').upsert({ organization_id: auth.data.organizationId, performance_cycle_id: parsed.data.performanceCycleId, employee_id: parsed.data.employeeId, proposed_rating: parsed.data.proposedRating ?? null, calibrated_rating: parsed.data.calibratedRating ?? null, rationale: parsed.data.rationale || null, calibration_status: parsed.data.calibrationStatus, calibrated_by: parsed.data.calibrationStatus === 'confirmed' ? auth.data.userId : null, calibrated_at: parsed.data.calibrationStatus === 'confirmed' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: 'performance_cycle_id,employee_id' }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Calibration record persistence returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'performance_calibration', entity_id: data.id, before_state: null, after_state: { employee_id: parsed.data.employeeId, calibrated_rating: parsed.data.calibratedRating ?? null, status: parsed.data.calibrationStatus } })
    revalidatePerformancePaths()
    return actionSuccess(data as PerformanceCalibrationRecordRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update calibration record.')
  }
}

export async function getPerformanceReviewDetailAction(input: z.input<typeof reviewIdSchema>): Promise<ActionResponse<PerformanceReviewDetail>> {
  const parsed = reviewIdSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: review, error: reviewError } = await supabase.from('performance_reviews').select('*').eq('id', parsed.data.reviewId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (reviewError || !review) return actionFailure(reviewError?.message || 'Performance review was not found.')
    const [answers, feedbackRequests, feedbackResponses, goals, checkIns, talentAssessment, calibration] = await Promise.all([
      supabase.from('performance_review_answers').select('*').eq('performance_review_id', review.id).eq('organization_id', auth.data.organizationId).order('question_key'),
      supabase.from('performance_feedback_requests').select('*').eq('organization_id', auth.data.organizationId).eq('performance_review_id', review.id).order('created_at', { ascending: false }),
      supabase.from('performance_feedback_responses').select('*').eq('organization_id', auth.data.organizationId).order('submitted_at', { ascending: false }),
      supabase.from('goals').select('*').eq('organization_id', auth.data.organizationId).eq('employee_id', review.employee_id).order('updated_at', { ascending: false }),
      supabase.from('goal_check_ins').select('*').eq('organization_id', auth.data.organizationId).eq('employee_id', review.employee_id).order('check_in_date', { ascending: false }),
      supabase.from('talent_assessments').select('*').eq('organization_id', auth.data.organizationId).eq('performance_cycle_id', review.performance_cycle_id).eq('employee_id', review.employee_id).maybeSingle(),
      supabase.from('performance_calibration_records').select('*').eq('organization_id', auth.data.organizationId).eq('performance_cycle_id', review.performance_cycle_id).eq('employee_id', review.employee_id).maybeSingle()
    ])
    const error = answers.error || feedbackRequests.error || feedbackResponses.error || goals.error || checkIns.error || talentAssessment.error || calibration.error
    if (error) return actionFailure(error.message)
    const requestIds = new Set(((feedbackRequests.data || []) as PerformanceFeedbackRequestRow[]).map(request => request.id))
    return actionSuccess({ review: review as PerformanceReviewRow, answers: (answers.data || []) as PerformanceReviewAnswerRow[], feedbackRequests: (feedbackRequests.data || []) as PerformanceFeedbackRequestRow[], feedbackResponses: ((feedbackResponses.data || []) as PerformanceFeedbackResponseRow[]).filter(response => requestIds.has(response.feedback_request_id)), goals: (goals.data || []) as GoalRow[], checkIns: (checkIns.data || []) as GoalCheckInRow[], talentAssessment: (talentAssessment.data || null) as TalentAssessmentRow | null, calibration: (calibration.data || null) as PerformanceCalibrationRecordRow | null })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load performance review detail.')
  }
}

export async function generatePerformanceSummaryAction(input: z.input<typeof generateSummarySchema>): Promise<ActionResponse<PerformanceReviewRow>> {
  const parsed = generateSummarySchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('admin')
  if (!auth.success) return auth
  const groq = getGroqClient()
  if (!groq.success) return actionFailure(groq.error)
  try {
    const supabase = await createServerSupabaseClient()
    const detail = await getPerformanceReviewDetailAction({ reviewId: parsed.data.reviewId })
    if (!detail.success) return detail
    const { data: employee, error: employeeError } = await supabase.from('employees').select('first_name,last_name,job_title_id,department_id').eq('id', detail.data.review.employee_id).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (employeeError) return actionFailure(employeeError.message)
    const context = {
      employee: employee ? `${employee.first_name} ${employee.last_name}` : 'Employee',
      review: { review_type: detail.data.review.review_type, overall_rating: detail.data.review.overall_rating, summary: detail.data.review.summary },
      goals: detail.data.goals.map(goal => ({ title: goal.title, progress_percent: goal.progress_percent, status: goal.status, due_date: goal.due_date })),
      check_ins: detail.data.checkIns.map(checkIn => ({ check_in_date: checkIn.check_in_date, progress_percent: checkIn.progress_percent, confidence: checkIn.confidence, blockers: checkIn.blockers, next_steps: checkIn.next_steps })),
      feedback: detail.data.feedbackResponses.map(response => ({ overall_rating: response.overall_rating, strengths: response.strengths, growth_areas: response.growth_areas, answers: response.answers }))
    }
    const completion = await groq.client.chat.completions.create({ model: groq.model, temperature: 0.2, max_tokens: 700, messages: [{ role: 'system', content: 'Write a concise evidence-based performance review summary. Use only the supplied work evidence. Do not infer protected traits, health, personality, or future potential. Distinguish evidence, growth focus, and manager discussion. Return plain text only.' }, { role: 'user', content: JSON.stringify(context) }] })
    const aiSummary = completion.choices[0]?.message?.content?.trim()
    if (!aiSummary) return actionFailure('Groq did not return an AI performance summary.')
    const { data, error } = await supabase.from('performance_reviews').update({ ai_summary: aiSummary, updated_at: new Date().toISOString() }).eq('id', detail.data.review.id).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !data) return actionFailure(error?.message || 'AI summary persistence returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'generate', entity_type: 'performance_ai_summary', entity_id: detail.data.review.id, before_state: { ai_summary_present: Boolean(detail.data.review.ai_summary) }, after_state: { model: groq.model, ai_summary_present: true } })
    revalidatePerformancePaths()
    return actionSuccess(data as PerformanceReviewRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to generate AI performance summary.')
  }
}
