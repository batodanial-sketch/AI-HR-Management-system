import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  FeedbackNoteRow,
  GoalCheckInRow,
  GoalRow,
  PerformanceCalibrationRecordRow,
  PerformanceCycleRow,
  PerformanceFeedbackRequestRow,
  PerformanceFeedbackResponseRow,
  PerformanceReviewRow,
  TalentAssessmentRow
} from '@/src/lib/supabase'

export type PerformanceWorkspaceData = {
  cycles: PerformanceCycleRow[]
  goals: GoalRow[]
  reviews: PerformanceReviewRow[]
  feedback: FeedbackNoteRow[]
  feedbackRequests: PerformanceFeedbackRequestRow[]
  feedbackResponses: PerformanceFeedbackResponseRow[]
  goalCheckIns: GoalCheckInRow[]
  talentAssessments: TalentAssessmentRow[]
  calibrationRecords: PerformanceCalibrationRecordRow[]
}

export async function getPerformanceWorkspace(supabase: SupabaseClient<Database>, organizationId: string): Promise<PerformanceWorkspaceData> {
  const [cycles, goals, reviews, feedback, feedbackRequests, feedbackResponses, goalCheckIns, talentAssessments, calibrationRecords] = await Promise.all([
    supabase.from('performance_cycles').select('*').eq('organization_id', organizationId).order('end_date', { ascending: false }),
    supabase.from('goals').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    supabase.from('performance_reviews').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    supabase.from('feedback_notes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(200),
    supabase.from('performance_feedback_requests').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    supabase.from('performance_feedback_responses').select('*').eq('organization_id', organizationId).order('submitted_at', { ascending: false }),
    supabase.from('goal_check_ins').select('*').eq('organization_id', organizationId).order('check_in_date', { ascending: false }),
    supabase.from('talent_assessments').select('*').eq('organization_id', organizationId).order('assessed_at', { ascending: false }),
    supabase.from('performance_calibration_records').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
  ])
  const error = cycles.error || goals.error || reviews.error || feedback.error || feedbackRequests.error || feedbackResponses.error || goalCheckIns.error || talentAssessments.error || calibrationRecords.error
  if (error) throw new Error(error.message)
  return {
    cycles: (cycles.data || []) as PerformanceCycleRow[],
    goals: (goals.data || []) as GoalRow[],
    reviews: (reviews.data || []) as PerformanceReviewRow[],
    feedback: (feedback.data || []) as FeedbackNoteRow[],
    feedbackRequests: (feedbackRequests.data || []) as PerformanceFeedbackRequestRow[],
    feedbackResponses: (feedbackResponses.data || []) as PerformanceFeedbackResponseRow[],
    goalCheckIns: (goalCheckIns.data || []) as GoalCheckInRow[],
    talentAssessments: (talentAssessments.data || []) as TalentAssessmentRow[],
    calibrationRecords: (calibrationRecords.data || []) as PerformanceCalibrationRecordRow[]
  }
}

export async function getPerformanceReviewById(supabase: SupabaseClient<Database>, organizationId: string, reviewId: string) {
  const { data, error } = await supabase.from('performance_reviews').select('*').eq('id', reviewId).eq('organization_id', organizationId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data || null) as PerformanceReviewRow | null
}
