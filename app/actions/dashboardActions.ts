'use server'

import {
  createServerSupabaseClient,
  type ApplicationRow,
  type AttendanceRecordRow,
  type DepartmentRow,
  type DocumentRow,
  type EmployeeRow,
  type GoalRow,
  type JobOpeningRow,
  type JobTitleRow,
  type LeaveRequestRow,
  type NotificationRow,
  type OrganizationRow,
  type PayrollCycleRow,
  type PayrollEntryRow,
  type PerformanceReviewRow,
  type WorkflowRow,
  type WorkflowRunRow
} from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { requireOrganizationContext } from './_shared'

export type DashboardOverview = {
  organization: Pick<OrganizationRow, 'id' | 'name' | 'currency_code' | 'timezone'> | null
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'department_id' | 'job_title_id' | 'manager_id' | 'status' | 'start_date'>[]
  departments: DepartmentRow[]
  jobTitles: JobTitleRow[]
  jobs: JobOpeningRow[]
  applications: ApplicationRow[]
  leaveRequests: LeaveRequestRow[]
  payrollCycles: PayrollCycleRow[]
  payrollEntries: PayrollEntryRow[]
  documents: DocumentRow[]
  notifications: NotificationRow[]
  workflows: WorkflowRow[]
  workflowRuns: WorkflowRunRow[]
}

export type PeopleAnalyticsOverview = {
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'department_id' | 'job_title_id' | 'manager_id' | 'status' | 'start_date'>[]
  departments: DepartmentRow[]
  jobTitles: JobTitleRow[]
  attendance: AttendanceRecordRow[]
  leaveRequests: LeaveRequestRow[]
  goals: GoalRow[]
  reviews: PerformanceReviewRow[]
  workflowRuns: WorkflowRunRow[]
}

export async function getDashboardOverviewAction(): Promise<ActionResponse<DashboardOverview>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [organizationResult, employeesResult, departmentsResult, titlesResult, jobsResult, applicationsResult, leaveResult, payrollCyclesResult, payrollEntriesResult, documentsResult, notificationsResult, workflowsResult, workflowRunsResult] = await Promise.all([
      supabase.from('organizations').select('id,name,currency_code,timezone').eq('id', auth.data.organizationId).maybeSingle(),
      supabase.from('employees').select('id,first_name,last_name,department_id,job_title_id,manager_id,status,start_date').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name'),
      supabase.from('departments').select('*').eq('organization_id', auth.data.organizationId).order('name'),
      supabase.from('job_titles').select('*').eq('organization_id', auth.data.organizationId).order('name'),
      supabase.from('job_openings').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('applications').select('*').eq('organization_id', auth.data.organizationId).order('applied_at', { ascending: false }),
      supabase.from('leave_requests').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('payroll_cycles').select('*').eq('organization_id', auth.data.organizationId).order('period_end', { ascending: false }),
      supabase.from('payroll_entries').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('documents').select('*').eq('organization_id', auth.data.organizationId).order('updated_at', { ascending: false }).limit(20),
      supabase.from('notifications').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }).limit(20),
      supabase.from('workflows').select('*').eq('organization_id', auth.data.organizationId).order('updated_at', { ascending: false }),
      supabase.from('workflow_runs').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }).limit(30)
    ])
    const error = organizationResult.error || employeesResult.error || departmentsResult.error || titlesResult.error || jobsResult.error || applicationsResult.error || leaveResult.error || payrollCyclesResult.error || payrollEntriesResult.error || documentsResult.error || notificationsResult.error || workflowsResult.error || workflowRunsResult.error
    if (error) return actionFailure(error.message)
    return actionSuccess({
      organization: (organizationResult.data || null) as DashboardOverview['organization'],
      employees: (employeesResult.data || []) as DashboardOverview['employees'],
      departments: (departmentsResult.data || []) as DepartmentRow[],
      jobTitles: (titlesResult.data || []) as JobTitleRow[],
      jobs: (jobsResult.data || []) as JobOpeningRow[],
      applications: (applicationsResult.data || []) as ApplicationRow[],
      leaveRequests: (leaveResult.data || []) as LeaveRequestRow[],
      payrollCycles: (payrollCyclesResult.data || []) as PayrollCycleRow[],
      payrollEntries: (payrollEntriesResult.data || []) as PayrollEntryRow[],
      documents: (documentsResult.data || []) as DocumentRow[],
      notifications: (notificationsResult.data || []) as NotificationRow[],
      workflows: (workflowsResult.data || []) as WorkflowRow[],
      workflowRuns: (workflowRunsResult.data || []) as WorkflowRunRow[]
    })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load dashboard data.')
  }
}

export async function getPeopleAnalyticsOverviewAction(): Promise<ActionResponse<PeopleAnalyticsOverview>> {
  const auth = await requireOrganizationContext('employee')
  if (!auth.success) return auth
  try {
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - 30)
    const sinceDate = since.toISOString().slice(0, 10)
    const supabase = await createServerSupabaseClient()
    const [employeesResult, departmentsResult, titlesResult, attendanceResult, leaveResult, goalsResult, reviewsResult, workflowRunsResult] = await Promise.all([
      supabase.from('employees').select('id,first_name,last_name,department_id,job_title_id,manager_id,status,start_date').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name'),
      supabase.from('departments').select('*').eq('organization_id', auth.data.organizationId).order('name'),
      supabase.from('job_titles').select('*').eq('organization_id', auth.data.organizationId).order('name'),
      supabase.from('attendance_records').select('*').eq('organization_id', auth.data.organizationId).gte('work_date', sinceDate).order('work_date', { ascending: false }),
      supabase.from('leave_requests').select('*').eq('organization_id', auth.data.organizationId).gte('end_date', sinceDate).order('start_date', { ascending: false }),
      supabase.from('goals').select('*').eq('organization_id', auth.data.organizationId).order('updated_at', { ascending: false }),
      supabase.from('performance_reviews').select('*').eq('organization_id', auth.data.organizationId).order('updated_at', { ascending: false }),
      supabase.from('workflow_runs').select('*').eq('organization_id', auth.data.organizationId).gte('created_at', since.toISOString()).order('created_at', { ascending: false })
    ])
    const error = employeesResult.error || departmentsResult.error || titlesResult.error || attendanceResult.error || leaveResult.error || goalsResult.error || reviewsResult.error || workflowRunsResult.error
    if (error) return actionFailure(error.message)
    return actionSuccess({
      employees: (employeesResult.data || []) as PeopleAnalyticsOverview['employees'],
      departments: (departmentsResult.data || []) as DepartmentRow[],
      jobTitles: (titlesResult.data || []) as JobTitleRow[],
      attendance: (attendanceResult.data || []) as AttendanceRecordRow[],
      leaveRequests: (leaveResult.data || []) as LeaveRequestRow[],
      goals: (goalsResult.data || []) as GoalRow[],
      reviews: (reviewsResult.data || []) as PerformanceReviewRow[],
      workflowRuns: (workflowRunsResult.data || []) as WorkflowRunRow[]
    })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load people analytics.')
  }
}
