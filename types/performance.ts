export type PerformanceCycleStatus = 'draft' | 'active' | 'calibration' | 'closed' | 'archived'
export type FeedbackRelationship = 'self' | 'manager' | 'peer' | 'direct_report' | 'cross_functional' | 'external'
export type FeedbackVisibility = 'manager_and_hr' | 'hr_only' | 'subject_after_cycle' | 'anonymous_to_subject'
export type FeedbackRequestStatus = 'pending' | 'submitted' | 'expired' | 'cancelled'
export type TalentReadiness = 'developing' | 'ready_1_2_years' | 'ready_now' | 'critical_expert'
export type RetentionRisk = 'not_assessed' | 'low' | 'moderate' | 'high'

export type PerformanceCycle = {
  id: string
  name: string
  description: string | null
  startDate: string
  endDate: string
  selfReviewDueAt: string | null
  managerReviewDueAt: string | null
  calibrationDueAt: string | null
  status: PerformanceCycleStatus | string
  publishedAt: string | null
}

export type FeedbackQuestion = {
  id: string
  prompt: string
  required?: boolean
  scale?: 'rating_1_5' | 'text'
}

export type FeedbackRequest = {
  id: string
  performanceCycleId: string | null
  performanceReviewId: string | null
  subjectEmployeeId: string
  recipientEmployeeId: string | null
  recipientEmail: string | null
  relationship: FeedbackRelationship
  visibility: FeedbackVisibility
  questions: FeedbackQuestion[]
  status: FeedbackRequestStatus
  dueAt: string | null
}

export type FeedbackSubmission = {
  requestId: string
  overallRating?: number | null
  answers: Record<string, string | number | null>
  strengths?: string | null
  growthAreas?: string | null
}

export type TalentAssessment = {
  id: string
  performanceCycleId: string
  employeeId: string
  performanceRating: number | null
  potentialRating: number | null
  readiness: TalentReadiness
  retentionRisk: RetentionRisk
  calibrationNote: string | null
}

export type CalibrationRecord = {
  id: string
  performanceCycleId: string
  employeeId: string
  proposedRating: number | null
  calibratedRating: number | null
  rationale: string | null
  calibrationStatus: 'pending' | 'confirmed' | 'needs_review'
}
