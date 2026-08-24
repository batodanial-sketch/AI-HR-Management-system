import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, PayrollCycleRow, PayrollEntryRow } from '@/src/lib/supabase'

export async function findPayrollCycle(supabase: SupabaseClient<Database>, organizationId: string, cycleId: string) {
  const { data, error } = await supabase.from('payroll_cycles').select('*').eq('organization_id', organizationId).eq('id', cycleId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data || null) as PayrollCycleRow | null
}

export async function findPayrollEntries(supabase: SupabaseClient<Database>, organizationId: string, cycleId: string) {
  const { data, error } = await supabase.from('payroll_entries').select('*').eq('organization_id', organizationId).eq('payroll_cycle_id', cycleId)
  if (error) throw new Error(error.message)
  return (data || []) as PayrollEntryRow[]
}

export async function updatePayrollCycle(supabase: SupabaseClient<Database>, organizationId: string, cycleId: string, patch: Partial<PayrollCycleRow>) {
  const { data, error } = await supabase.from('payroll_cycles').update(patch).eq('organization_id', organizationId).eq('id', cycleId).select().single()
  if (error || !data) throw new Error(error?.message || 'Payroll cycle update returned no record.')
  return data as PayrollCycleRow
}
