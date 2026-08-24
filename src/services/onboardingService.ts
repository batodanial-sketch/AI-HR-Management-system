import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, OnboardingEnrollmentRow, OnboardingProgramRow, OnboardingTaskRow } from '@/src/lib/supabase'

export async function getOnboardingWorkspace(supabase: SupabaseClient<Database>, organizationId: string) {
  const [programs, enrollments, tasks] = await Promise.all([
    supabase.from('onboarding_programs').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    supabase.from('onboarding_enrollments').select('*').eq('organization_id', organizationId).order('start_date', { ascending: false }),
    supabase.from('onboarding_tasks').select('*').eq('organization_id', organizationId).order('sort_order')
  ])
  const error = programs.error || enrollments.error || tasks.error
  if (error) throw new Error(error.message)
  return { programs: (programs.data || []) as OnboardingProgramRow[], enrollments: (enrollments.data || []) as OnboardingEnrollmentRow[], tasks: (tasks.data || []) as OnboardingTaskRow[] }
}
