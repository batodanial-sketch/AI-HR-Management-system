import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/src/lib/supabase'

export type WorkforceAnalytics = {
  headcount: number
  openJobs: number
  pendingLeave: number
  payrollInReview: number
  averagePerformanceRating: number | null
  failedWorkflows: number
}

export async function getWorkforceAnalytics(supabase: SupabaseClient<Database>, organizationId: string): Promise<WorkforceAnalytics> {
  const [employees, jobs, leave, payroll, reviews, workflows] = await Promise.all([
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('deleted_at', null),
    supabase.from('job_openings').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'open'),
    supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'pending'),
    supabase.from('payroll_cycles').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', ['review', 'approved']),
    supabase.from('performance_reviews').select('overall_rating').eq('organization_id', organizationId),
    supabase.from('workflow_runs').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'failed')
  ])
  const error = employees.error || jobs.error || leave.error || payroll.error || reviews.error || workflows.error
  if (error) throw new Error(error.message)
  const ratings = (reviews.data || []).flatMap((review: { overall_rating: number | null }) => review.overall_rating === null ? [] : [review.overall_rating])
  return { headcount: employees.count || 0, openJobs: jobs.count || 0, pendingLeave: leave.count || 0, payrollInReview: payroll.count || 0, averagePerformanceRating: ratings.length ? Number((ratings.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.length).toFixed(1)) : null, failedWorkflows: workflows.count || 0 }
}
