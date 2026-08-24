'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import { enqueuePythonJob } from '@/src/lib/pythonBridge'
import { createServerSupabaseClient, type AiInterviewKitRow, type CandidateAiAssessmentRow } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const queueScreeningSchema = z.object({
  applicationId: uuidSchema,
  resumeText: z.string().min(30).max(70000),
  jobContext: z.record(z.string(), z.unknown())
})

const persistAssessmentSchema = z.object({
  applicationId: uuidSchema,
  candidateId: uuidSchema,
  resumeId: uuidSchema.optional().nullable(),
  modelProvider: z.string().min(1).max(80),
  modelName: z.string().min(1).max(180),
  promptVersion: z.string().min(1).max(80),
  overallScore: z.number().min(0).max(100),
  jobMatchScore: z.number().min(0).max(100),
  experienceScore: z.number().min(0).max(100),
  skillsScore: z.number().min(0).max(100),
  educationScore: z.number().min(0).max(100),
  recommendation: z.enum(['STRONG', 'QUALIFIED', 'CONSIDER', 'REJECT']),
  strengths: z.array(z.string().max(500)).default([]),
  gaps: z.array(z.string().max(500)).default([]),
  citations: z.array(z.record(z.string(), z.unknown())).default([]),
  suggestedQuestions: z.array(z.record(z.string(), z.unknown())).default([]),
  rationale: z.string().max(5000).optional().nullable(),
  rawResponse: z.record(z.string(), z.unknown()).optional().nullable(),
  latencyMs: z.number().int().nonnegative().optional().nullable()
})

const createKitSchema = z.object({
  applicationId: uuidSchema,
  assessmentId: uuidSchema.optional().nullable(),
  interviewRound: z.string().min(2).max(80),
  durationMinutes: z.number().int().min(10).max(180),
  questions: z.array(z.record(z.string(), z.unknown())).min(1),
  assessmentRubric: z.record(z.string(), z.unknown()),
  timeAllocation: z.record(z.string(), z.unknown()).default({}),
  modelProvider: z.string().min(1).max(80),
  modelName: z.string().min(1).max(180),
  promptVersion: z.string().min(1).max(80),
  rawResponse: z.record(z.string(), z.unknown()).optional().nullable()
})

export async function queueAiScreeningAction(input: z.input<typeof queueScreeningSchema>): Promise<ActionResponse<{ jobId: string; status: string }>> {
  const parsed = queueScreeningSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('recruitment')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: application, error } = await supabase.from('applications').select('id,candidate_id,job_opening_id').eq('id', parsed.data.applicationId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (error || !application) return actionFailure(error?.message || 'Application was not found.')
    const job = await enqueuePythonJob('ai_assessment', { organizationId: auth.data.organizationId, requestedBy: auth.data.userId, payload: { application_id: application.id, candidate_id: application.candidate_id, job_opening_id: application.job_opening_id, resume_text: parsed.data.resumeText, job_context: parsed.data.jobContext, notification_title: 'AI screening queued' } })
    if (!job.success) return actionFailure(job.error)
    await supabase.from('applications').update({ stage: 'screening', stage_changed_at: new Date().toISOString() }).eq('id', application.id)
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'generate', entity_type: 'ai_screening_job', entity_id: application.id, before_state: null, after_state: { python_job_id: job.data.id } })
    revalidateWorkspacePaths('/')
    return actionSuccess({ jobId: job.data.id, status: job.data.status })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to queue AI screening.')
  }
}

export async function persistAiAssessmentAction(input: z.input<typeof persistAssessmentSchema>): Promise<ActionResponse<CandidateAiAssessmentRow>> {
  const parsed = persistAssessmentSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('recruitment')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const payload = parsed.data
    const { data, error } = await supabase.from('candidate_ai_assessments').insert({ organization_id: auth.data.organizationId, candidate_id: payload.candidateId, application_id: payload.applicationId, resume_id: payload.resumeId || null, model_provider: payload.modelProvider, model_name: payload.modelName, prompt_version: payload.promptVersion, overall_score: payload.overallScore, job_match_score: payload.jobMatchScore, experience_score: payload.experienceScore, skills_score: payload.skillsScore, education_score: payload.educationScore, recommendation: payload.recommendation, strengths: toJson(payload.strengths), gaps: toJson(payload.gaps), citations: toJson(payload.citations), suggested_questions: toJson(payload.suggestedQuestions), rationale: payload.rationale || null, raw_response: toJson(payload.rawResponse || null), screening_latency_ms: payload.latencyMs || null, reviewed_by: null, reviewed_at: null }).select().single()
    if (error || !data) return actionFailure(error?.message || 'AI assessment persistence returned no record.')
    const targetStage = payload.overallScore > 70 ? 'shortlisted' : 'rejected'
    await supabase.from('applications').update({ stage: targetStage, stage_changed_at: new Date().toISOString(), rejection_reason: targetStage === 'rejected' ? payload.rationale || 'AI screening score below configured threshold.' : null }).eq('id', payload.applicationId).eq('organization_id', auth.data.organizationId)
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'generate', entity_type: 'candidate_ai_assessment', entity_id: data.id, before_state: null, after_state: { overall_score: payload.overallScore, recommendation: payload.recommendation, target_stage: targetStage } })
    revalidateWorkspacePaths('/')
    return actionSuccess(data as CandidateAiAssessmentRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to persist AI assessment.')
  }
}

export async function createAiInterviewKitAction(input: z.input<typeof createKitSchema>): Promise<ActionResponse<AiInterviewKitRow>> {
  const parsed = createKitSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('recruitment')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const payload = parsed.data
    const { data, error } = await supabase.from('ai_interview_kits').insert({ organization_id: auth.data.organizationId, application_id: payload.applicationId, assessment_id: payload.assessmentId || null, generated_by: auth.data.userId, model_provider: payload.modelProvider, model_name: payload.modelName, prompt_version: payload.promptVersion, interview_round: payload.interviewRound, duration_minutes: payload.durationMinutes, questions: toJson(payload.questions), assessment_rubric: toJson(payload.assessmentRubric), time_allocation: toJson(payload.timeAllocation), raw_response: toJson(payload.rawResponse || null) }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Interview kit persistence returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'generate', entity_type: 'ai_interview_kit', entity_id: data.id, before_state: null, after_state: { application_id: payload.applicationId, interview_round: payload.interviewRound } })
    revalidateWorkspacePaths('/')
    return actionSuccess(data as AiInterviewKitRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create AI interview kit.')
  }
}
