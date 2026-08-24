import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiInterviewKitRow, CandidateAiAssessmentRow, Database } from '@/src/lib/supabase'

export async function findAssessmentByApplication(supabase: SupabaseClient<Database>, organizationId: string, applicationId: string) {
  const { data, error } = await supabase.from('candidate_ai_assessments').select('*').eq('organization_id', organizationId).eq('application_id', applicationId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return (data || null) as CandidateAiAssessmentRow | null
}

export async function createAssessment(supabase: SupabaseClient<Database>, assessment: Partial<CandidateAiAssessmentRow>) {
  const { data, error } = await supabase.from('candidate_ai_assessments').insert(assessment).select().single()
  if (error || !data) throw new Error(error?.message || 'Assessment creation returned no record.')
  return data as CandidateAiAssessmentRow
}

export async function createInterviewKit(supabase: SupabaseClient<Database>, interviewKit: Partial<AiInterviewKitRow>) {
  const { data, error } = await supabase.from('ai_interview_kits').insert(interviewKit).select().single()
  if (error || !data) throw new Error(error?.message || 'Interview kit creation returned no record.')
  return data as AiInterviewKitRow
}
