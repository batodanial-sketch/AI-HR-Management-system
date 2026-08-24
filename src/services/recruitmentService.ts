import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApplicationRow, CandidateRow, Database, InterviewRow, JobOpeningRow } from '@/src/lib/supabase'

export async function findJobOpenings(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data, error } = await supabase.from('job_openings').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as JobOpeningRow[]
}

export async function findApplications(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data, error } = await supabase.from('applications').select('*').eq('organization_id', organizationId).order('applied_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as ApplicationRow[]
}

export async function findCandidates(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data, error } = await supabase.from('candidates').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as CandidateRow[]
}

export async function updateApplication(supabase: SupabaseClient<Database>, organizationId: string, applicationId: string, patch: Partial<ApplicationRow>) {
  const { data, error } = await supabase.from('applications').update(patch).eq('organization_id', organizationId).eq('id', applicationId).select().single()
  if (error || !data) throw new Error(error?.message || 'Application update returned no record.')
  return data as ApplicationRow
}

export async function createInterview(supabase: SupabaseClient<Database>, interview: Partial<InterviewRow>) {
  const { data, error } = await supabase.from('interviews').insert(interview).select().single()
  if (error || !data) throw new Error(error?.message || 'Interview creation returned no record.')
  return data as InterviewRow
}
