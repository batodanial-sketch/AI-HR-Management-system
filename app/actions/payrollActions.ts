'use server'
import { toJson } from "@/lib/utils";

import { z } from 'zod'
import {
  createServerSupabaseClient,
  type EmployeeRow,
  type PayrollCycleRow,
  type PayrollEntryRow,
  type Database,
} from '@/src/lib/supabase'
import type { ActionResponse } from './types'
import { actionFailure, actionSuccess } from './types'
import { dateSchema, requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from './_shared'

const cycleStatusSchema = z.object({
  cycleId: uuidSchema,
  status: z.enum(['review', 'approved', 'paid', 'void']),
  notes: z.string().max(2000).optional()
})
const calculateSchema = z.object({ cycleId: uuidSchema })
const createCycleSchema = z.object({
  name: z.string().min(2).max(180),
  periodStart: dateSchema,
  periodEnd: dateSchema,
  payDate: dateSchema,
  currencyCode: z.string().length(3).transform(value => value.toUpperCase()),
  notes: z.string().max(2000).optional().nullable()
}).refine(value => value.periodEnd >= value.periodStart, { message: 'Payroll period end must be on or after its start.' })

export type PayrollCalculation = {
  cycle: PayrollCycleRow
  entries: PayrollEntryRow[]
  totalGross: number
  totalDeductions: number
  totalNet: number
  exceptions: Array<{ severity: 'error' | 'warning'; entryId: string; issue: string }>
}

export type PayrollOverview = {
  cycles: PayrollCycleRow[]
  entries: PayrollEntryRow[]
  employees: Pick<EmployeeRow, 'id' | 'first_name' | 'last_name' | 'employee_number' | 'status'>[]
}

function payPeriodsPerYear(frequency: string): number {
  const normalized = frequency.toLowerCase().replace(/[\s_-]/g, '')
  if (normalized.includes('weekly')) return 52
  if (normalized.includes('biweekly') || normalized.includes('fortnightly')) return 26
  if (normalized.includes('semimonthly')) return 24
  if (normalized.includes('quarterly')) return 4
  if (normalized.includes('annual') || normalized.includes('yearly')) return 1
  return 12
}

function summarize(cycle: PayrollCycleRow, entries: PayrollEntryRow[]): PayrollCalculation {
  const exceptions = entries.flatMap(entry => {
    const output: Array<{ severity: 'error' | 'warning'; entryId: string; issue: string }> = []
    if (Number(entry.gross_pay) < 0 || Number(entry.net_pay) < 0) output.push({ severity: 'error', entryId: entry.id, issue: 'Negative payout value detected.' })
    if (Number(entry.total_deductions) > Number(entry.gross_pay)) output.push({ severity: 'error', entryId: entry.id, issue: 'Deductions exceed gross pay.' })
    if (!entry.currency_code) output.push({ severity: 'warning', entryId: entry.id, issue: 'Currency code is missing.' })
    return output
  })
  return {
    cycle,
    entries,
    totalGross: entries.reduce((sum, entry) => sum + Number(entry.gross_pay), 0),
    totalDeductions: entries.reduce((sum, entry) => sum + Number(entry.total_deductions), 0),
    totalNet: entries.reduce((sum, entry) => sum + Number(entry.net_pay), 0),
    exceptions
  }
}

export async function getPayrollOverviewAction(): Promise<ActionResponse<PayrollOverview>> {
  const auth = await requireOrganizationContext('payroll')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [cyclesResult, entriesResult, employeesResult] = await Promise.all([
      supabase.from('payroll_cycles').select('*').eq('organization_id', auth.data.organizationId).order('period_end', { ascending: false }),
      supabase.from('payroll_entries').select('*').eq('organization_id', auth.data.organizationId).order('created_at', { ascending: false }),
      supabase.from('employees').select('id,first_name,last_name,employee_number,status').eq('organization_id', auth.data.organizationId).is('deleted_at', null).order('first_name')
    ])
    const error = cyclesResult.error || entriesResult.error || employeesResult.error
    if (error) return actionFailure(error.message)
    return actionSuccess({
      cycles: (cyclesResult.data || []) as PayrollCycleRow[],
      entries: (entriesResult.data || []) as PayrollEntryRow[],
      employees: (employeesResult.data || []) as PayrollOverview['employees']
    })
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to load payroll overview.')
  }
}

export async function getPayrollCycleAction(cycleId: string): Promise<ActionResponse<PayrollCalculation>> {
  const parsed = uuidSchema.safeParse(cycleId)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('payroll')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const [cycleResult, entryResult] = await Promise.all([
      supabase.from('payroll_cycles').select('*').eq('id', parsed.data).eq('organization_id', auth.data.organizationId).maybeSingle(),
      supabase.from('payroll_entries').select('*').eq('payroll_cycle_id', parsed.data).eq('organization_id', auth.data.organizationId).order('created_at')
    ])
    if (cycleResult.error || !cycleResult.data) return actionFailure(cycleResult.error?.message || 'Payroll cycle was not found.')
    if (entryResult.error) return actionFailure(entryResult.error.message)
    return actionSuccess(summarize(cycleResult.data as PayrollCycleRow, (entryResult.data || []) as PayrollEntryRow[]))
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to calculate payroll cycle.')
  }
}

export async function createPayrollCycleAction(input: z.input<typeof createCycleSchema>): Promise<ActionResponse<PayrollCalculation>> {
  const parsed = createCycleSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('payroll')
  if (!auth.success) return auth

  try {
    const supabase = await createServerSupabaseClient()
    const { data: cycle, error: cycleError } = await supabase.from('payroll_cycles').insert({
      organization_id: auth.data.organizationId,
      name: parsed.data.name,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      pay_date: parsed.data.payDate,
      currency_code: parsed.data.currencyCode,
      status: 'draft',
      notes: parsed.data.notes || null
    }).select().single()
    if (cycleError || !cycle) return actionFailure(cycleError?.message || 'Payroll cycle creation returned no record.')

    const [employeesResult, compensationResult] = await Promise.all([
      supabase.from('employees').select('id').eq('organization_id', auth.data.organizationId).eq('status', 'active').is('deleted_at', null),
      supabase.from('compensation_packages').select('*').eq('organization_id', auth.data.organizationId).lte('effective_from', parsed.data.periodEnd).order('effective_from', { ascending: false })
    ])
    const sourceError = employeesResult.error || compensationResult.error
    if (sourceError) {
      await supabase.from('payroll_cycles').delete().eq('id', cycle.id).eq('organization_id', auth.data.organizationId)
      return actionFailure(`Payroll cycle was rolled back because compensation data could not be loaded: ${sourceError.message}`)
    }

    const latestCompensation = new Map<string, { annual_salary: number; currency_code: string; pay_frequency: string }>()
    for (const packageRow of compensationResult.data || []) {
      const effectiveTo = packageRow.effective_to as string | null
      if (effectiveTo && effectiveTo < parsed.data.periodStart) continue
      if (!latestCompensation.has(packageRow.employee_id as string)) {
        latestCompensation.set(packageRow.employee_id as string, {
          annual_salary: Number(packageRow.annual_salary),
          currency_code: String(packageRow.currency_code),
          pay_frequency: String(packageRow.pay_frequency || 'monthly')
        })
      }
    }

    const entryRows = (employeesResult.data || []).flatMap((employee: { id: string }) => {
      const compensation = latestCompensation.get(employee.id)
      if (!compensation) return []
      const grossPay = Number((compensation.annual_salary / payPeriodsPerYear(compensation.pay_frequency)).toFixed(2))
      return [{
        organization_id: auth.data.organizationId,
        payroll_cycle_id: cycle.id,
        employee_id: employee.id,
        gross_pay: grossPay,
        taxable_pay: grossPay,
        total_deductions: 0,
        net_pay: grossPay,
        currency_code: compensation.currency_code || parsed.data.currencyCode,
        payment_status: 'draft',
        bank_reference: null
      }]
    })
    let entries: PayrollEntryRow[] = []
    if (entryRows.length) {
      const { data: insertedEntries, error: entriesError } = await supabase.from('payroll_entries').insert(entryRows).select()
      if (entriesError) {
        await supabase.from('payroll_cycles').delete().eq('id', cycle.id).eq('organization_id', auth.data.organizationId)
        return actionFailure(`Payroll entries could not be calculated and the cycle was rolled back: ${entriesError.message}`)
      }
      entries = (insertedEntries || []) as PayrollEntryRow[]
    }

    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: 'create',
      entity_type: 'payroll_cycle',
      entity_id: cycle.id,
      before_state: null,
      after_state: { period_start: parsed.data.periodStart, period_end: parsed.data.periodEnd, employee_entries: entries.length, currency_code: parsed.data.currencyCode }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(summarize(cycle as PayrollCycleRow, entries))
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to create payroll cycle.')
  }
}

export async function updatePayrollCycleStatusAction(input: z.input<typeof cycleStatusSchema>): Promise<ActionResponse<PayrollCycleRow>> {
  const parsed = cycleStatusSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  const auth = await requireOrganizationContext('payroll')
  if (!auth.success) return auth
  try {
    const supabase = await createServerSupabaseClient()
    const { data: existing, error: existingError } = await supabase.from('payroll_cycles').select('*').eq('id', parsed.data.cycleId).eq('organization_id', auth.data.organizationId).maybeSingle()
    if (existingError || !existing) return actionFailure(existingError?.message || 'Payroll cycle was not found.')
    if (existing.status === 'void' || existing.status === 'paid') return actionFailure('A void or paid payroll cycle cannot be changed.')

    const statusPatch: Record<string, unknown> = { status: parsed.data.status, notes: parsed.data.notes || existing.notes || null, updated_at: new Date().toISOString() }
    if (parsed.data.status === 'approved') { statusPatch.approved_by = auth.data.userId; statusPatch.approved_at = new Date().toISOString() }
    if (parsed.data.status === 'paid') statusPatch.paid_at = new Date().toISOString()
    const { data, error } = await supabase.from('payroll_cycles').update(statusPatch as Database['public']['Tables']['payroll_cycles']['Update']).eq('id', parsed.data.cycleId).eq('organization_id', auth.data.organizationId).select().single()
    if (error || !data) return actionFailure(error?.message || 'Payroll cycle update returned no record.')
    if (parsed.data.status === 'paid') {
      const { error: entriesError } = await supabase.from('payroll_entries').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('payroll_cycle_id', parsed.data.cycleId).eq('organization_id', auth.data.organizationId)
      if (entriesError) return actionFailure(`Cycle updated but entry payment status update failed: ${entriesError.message}`)
    }
    await supabase.from('audit_logs').insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: parsed.data.status === 'approved' ? 'approve' : 'update',
      entity_type: 'payroll_cycle',
      entity_id: parsed.data.cycleId,
      before_state: { status: existing.status, notes: existing.notes },
      after_state: { status: parsed.data.status, notes: parsed.data.notes || null }
    })
    revalidateWorkspacePaths('/', '/dashboard')
    return actionSuccess(data as PayrollCycleRow)
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : 'Unable to update payroll cycle.')
  }
}

export async function calculatePayrollAction(input: z.input<typeof calculateSchema>): Promise<ActionResponse<PayrollCalculation>> {
  const parsed = calculateSchema.safeParse(input)
  if (!parsed.success) return validationFailure(parsed.error)
  return getPayrollCycleAction(parsed.data.cycleId)
}
