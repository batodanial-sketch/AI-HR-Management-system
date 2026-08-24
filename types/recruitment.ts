import type { AiInterviewKitRow, ApplicationRow, CandidateAiAssessmentRow, CandidateRow, InterviewRow, JobOpeningRow, ResumeRow } from '@/src/lib/database.types'

export type RecruitmentOverview = {
  jobs: JobOpeningRow[]
  candidates: CandidateRow[]
  applications: ApplicationRow[]
  interviews: InterviewRow[]
}

export type CandidatePipelineRecord = {
  candidate: CandidateRow
  application: ApplicationRow
  jobOpening: JobOpeningRow
  resume: ResumeRow | null
  assessment: CandidateAiAssessmentRow | null
  interviewKit: AiInterviewKitRow | null
}

export type CreateJobOpeningInput = {
  title: string
  description: string
  departmentId?: string | null
  locationId?: string | null
  employmentType: JobOpeningRow['employment_type']
  skills: string[]
  minSalary?: number | null
  maxSalary?: number | null
  currencyCode?: string
  targetHireDate?: string | null
}

export type ApplicationStageUpdateInput = {
  applicationId: string
  stage: ApplicationRow['stage']
  rejectionReason?: string | null
}

export type InterviewScheduleInput = {
  applicationId: string
  title: string
  interviewType: string
  scheduledStart: string
  scheduledEnd: string
  meetingUrl?: string | null
  timezone?: string
  interviewerEmployeeIds?: string[]
  externalInterviewerEmails?: string[]
}
