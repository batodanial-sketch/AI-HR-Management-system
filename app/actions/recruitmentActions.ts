'use server'

import { z } from 'zod'
import { createServerSupabaseClient, type ApplicationRow, type CandidateRow, type InterviewRow, type JobOpeningRow } from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { dateSchema, isoDateTimeSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const createJobSchema = z.object({
  requisitionCode: z.string().min(3).max(64).optional(),
  title: z.string().min(2).max(180),
  description: z.string().min(20).max(20000),
  departmentId: uuidSchema.optional().nullable(),
  locationId: uuidSchema.optional().nullable(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']).default('full_time'),
  skills: z.array(z.string().min(1).max(80)).max(30).default([]),
  minSalary: z.number().nonnegative().optional().nullable(),
  maxSalary: z.number().nonnegative().optional().nullable(),
  currencyCode: z.string().length(3).default('USD'),
  targetHireDate: dateSchema.optional().nullable()
}).refine(value => value.minSalary == null || value.maxSalary == null || value.minSalary <= value.maxSalary, { message: 'Minimum salary cannot exceed maximum salary.' })

const createCandidateSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(64).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
  tags: z.array(z.string().min(1).max(80)).max(30).default([]),
  jobOpeningId: uuidSchema,
  stage: z.enum(['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']).default('applied')
})

const applicationStageSchema = z.object({
  applicationId: uuidSchema,
  stage: z.enum(['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']),
  rejectionReason: z.string().max(1000).optional().nullable()
})

const scheduleInterviewSchema = z.object({
  applicationId: uuidSchema,
  title: z.string().min(2).max(180),
  interviewType: z.string().min(2).max(80),
  scheduledStart: isoDateTimeSchema,
  scheduledEnd: isoDateTimeSchema,
  meetingUrl: z.string().url().optional().nullable(),
  timezone: z.string().min(2).max(80).default('UTC'),
  interviewerEmployeeIds: z.array(uuidSchema).max(20).default([]),
  externalInterviewerEmails: z.array(z.string().email()).max(20).default([])
}).refine(value => new Date(value.scheduledEnd).getTime() > new Date(value.scheduledStart).getTime(), { message: 'Interview end time must be after start time.' })

export async function getRecruitmentOverviewAction(): Promise<ActionResponse<{ jobs: JobOpeningRow[]; candidates: CandidateRow[]; applications: ApplicationRow[]; interviews: InterviewRow[] }>> {
  const auth = await requireOrganizationContext('recruitment')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const [jobs, candidates, applications, interviews] = await Promise.all([
      supabase.from('job_openings').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('candidates').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('applications').select('*').eq('organization_id', auth.data.organizationId).order('applied_at', { ascending: false }),
      supabase.from('interviews').select('*').eq('organization_id', auth.data.organizationId).order('scheduled_start', { ascending: true })
    ])
    const error = jobs.error || candidates.error || applications.error || interviews.error
    if (error) return actionFailure(error.message)
    return actionSuccess({ jobs: (jobs.data || []) as JobOpeningRow[], candidates: (candidates.data || []) as CandidateRow[], applications: (applications.data || []) as ApplicationRow[], interviews: (interviews.data || []) as InterviewRow[] })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load recruitment overview.')
  }
}

export async function createJobOpeningAction(input: z.input<typeof createJobSchema>): Promise<ActionResponse<JobOpeningRow>> {
  const parsed = createJobSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('recruitment')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const payload = parsed.data
    if (payload.departmentId) {
      const { data: department, error: departmentError } = await supabase.from('departments').select('id').eq('id', payload.departmentId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (departmentError || !department) return actionFailure(departmentError?.message || 'Department was not found in this organization.')
    }
    if (payload.locationId) {
      const { data: location, error: locationError } = await supabase.from('locations').select('id').eq('id', payload.locationId).eq('organization_id', auth.data.organizationId).maybeSingle()
      if (locationError || !location) return actionFailure(locationError?.message || 'Location was not found in this organization.')
    }
    const { data, error } = await supabase.from('job_openings').insert({
      organization_id: auth.data.organizationId,
      requisition_code: payload.requisitionCode || null,
      title: payload.title,
      description: payload.description,
      requirements: [],
      skills: payload.skills,
      employment_type: payload.employmentType,
      department_id: payload.departmentId || null,
      location_id: payload.locationId || null,
      min_salary: payload.minSalary || null,
      max_salary: payload.maxSalary || null,
      currency_code: payload.currencyCode,
      target_hire_date: payload.targetHireDate || null,
      status: 'open',
      published_at: new Date().toISOString()
    }).select().single()
    if (error || !data) return actionFailure(error?.message || 'Job opening creation returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'job_opening', entity_id: data.id, before_state: null, after_state: { title: payload.title, department_id: payload.departmentId || null, status: 'open' } })
    revalidateWorkspacePaths('/', '/recruitment', '/dashboard')
    return actionSuccess(data as JobOpeningRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create job opening.')
  }
}

export async function createCandidateApplicationAction(input: z.input<typeof createCandidateSchema>): Promise<ActionResponse<{ candidate: CandidateRow; application: ApplicationRow }>> {
  const parsed = createCandidateSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('recruitment')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const payload = parsed.data
    const { data: job, error: jobError } = await supabase.from('job_openings').select('id').eq('id', payload.jobOpeningId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (jobError || !job) return actionFailure(jobError?.message || 'Job opening was not found in this organization.')
    const { data: candidate, error: candidateError } = await supabase.from('candidates').insert({ organization_id: auth.data.organizationId, first_name: payload.firstName, last_name: payload.lastName, email: payload.email, phone: payload.phone || null, location: payload.location || null, source: payload.source || null, tags: payload.tags }).select().single()
    if (candidateError || !candidate) return actionFailure(candidateError?.message || 'Candidate creation returned no record.')
    const { data: application, error: applicationError } = await supabase.from('applications').insert({ organization_id: auth.data.organizationId, candidate_id: candidate.id, job_opening_id: payload.jobOpeningId, stage: payload.stage, source: payload.source || null, owner_id: null, stage_changed_at: new Date().toISOString() }).select().single()
    if (applicationError || !application) {
      await supabase.from('candidates').delete().eq('id', candidate.id).eq('organization_id', auth.data.organizationId)
      return actionFailure(applicationError?.message || 'Candidate was created but application creation failed and was rolled back.')
    }
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'candidate_application', entity_id: application.id, before_state: null, after_state: { candidate_id: candidate.id, job_opening_id: payload.jobOpeningId, stage: payload.stage } })
    revalidateWorkspacePaths('/', '/recruitment', '/dashboard')
    return actionSuccess({ candidate: candidate as CandidateRow, application: application as ApplicationRow })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create candidate application.')
  }
}

export async function updateApplicationStageAction(input: z.input<typeof applicationStageSchema>): Promise<ActionResponse<ApplicationRow>> {
  const parsed = applicationStageSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('recruitment')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data: existing, error: lookupError } = await supabase.from('applications').select('*').eq('id', parsed.data.applicationId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (lookupError || !existing) return actionFailure(lookupError?.message || 'Application was not found.')
    const { data, error } = await supabase.from('applications').update({ stage: parsed.data.stage, stage_changed_at: new Date().toISOString(), rejection_reason: parsed.data.stage === 'rejected' ? parsed.data.rejectionReason || 'Rejected after recruitment review.' : null }).eq('id', parsed.data.applicationId).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !data) return actionFailure(error?.message || 'Application stage update returned no record.')
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'update', entity_type: 'application', entity_id: data.id, before_state: { stage: existing.stage, rejection_reason: existing.rejection_reason }, after_state: { stage: parsed.data.stage, rejection_reason: data.rejection_reason } })
    revalidateWorkspacePaths('/', '/recruitment', '/dashboard')
    return actionSuccess(data as ApplicationRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update application stage.')
  }
}

export async function scheduleInterviewAction(input: z.input<typeof scheduleInterviewSchema>): Promise<ActionResponse<InterviewRow>> {
  const parsed = scheduleInterviewSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('recruitment')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const payload = parsed.data
    const { data: application, error: applicationLookupError } = await supabase.from('applications').select('id,stage').eq('id', payload.applicationId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (applicationLookupError || !application) return actionFailure(applicationLookupError?.message || 'Application was not found in this organization.')
    const { data: interview, error: interviewError } = await supabase.from('interviews').insert({ organization_id: auth.data.organizationId, application_id: payload.applicationId, title: payload.title, interview_type: payload.interviewType, status: 'planned', scheduled_start: payload.scheduledStart, scheduled_end: payload.scheduledEnd, meeting_url: payload.meetingUrl || null, timezone: payload.timezone, scorecard: {}, created_by: auth.data.userId }).select().single()
    if (interviewError || !interview) return actionFailure(interviewError?.message || 'Interview scheduling returned no record.')

    if (payload.interviewerEmployeeIds.length) {
      const { data: interviewers, error: interviewerError } = await supabase.from('employees').select('id').eq('organization_id', auth.data.organizationId).in('id', payload.interviewerEmployeeIds).is('deleted_at', null)
      if (interviewerError || (interviewers || []).length !== payload.interviewerEmployeeIds.length) {
        await supabase.from('interviews').delete().eq('id', interview.id).eq('organization_id', auth.data.organizationId)
        return actionFailure(interviewerError?.message || 'One or more interviewers were not found in this organization.')
      }
    }
    const participantRows = [
      ...payload.interviewerEmployeeIds.map(employeeId => ({ organization_id: auth.data.organizationId, interview_id: interview.id, employee_id: employeeId, external_email: null, role: 'interviewer' })),
      ...payload.externalInterviewerEmails.map(email => ({ organization_id: auth.data.organizationId, interview_id: interview.id, employee_id: null, external_email: email, role: 'interviewer' }))
    ]
    if (participantRows.length) {
      const { error: participantError } = await supabase.from('interview_participants').insert(participantRows)
      if (participantError) {
        await supabase.from('interviews').delete().eq('id', interview.id).eq('organization_id', auth.data.organizationId)
        return actionFailure(`Interview participant assignment failed and the interview was rolled back: ${participantError.message}`)
      }
    }

    const { error: stageError } = await supabase.from('applications').update({ stage: 'interview', stage_changed_at: new Date().toISOString() }).eq('id', payload.applicationId).eq('organization_id', auth.data.organizationId)
    if (stageError) {
      await supabase.from('interviews').delete().eq('id', interview.id).eq('organization_id', auth.data.organizationId)
      return actionFailure(`Application stage update failed and the interview was rolled back: ${stageError.message}`)
    }
    await supabase.from('audit_logs').insert({ organization_id: auth.data.organizationId, actor_user_id: auth.data.userId, action: 'create', entity_type: 'interview', entity_id: interview.id, before_state: null, after_state: { application_id: payload.applicationId, interview_type: payload.interviewType, prior_stage: application.stage, participant_count: participantRows.length } })
    revalidateWorkspacePaths('/', '/recruitment', '/dashboard')
    return actionSuccess(interview as InterviewRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to schedule interview.')
  }
}
