import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, EmployeeRow } from '@/src/lib/supabase'

export async function findEmployees(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data, error } = await supabase.from('employees').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as EmployeeRow[]
}

export async function findEmployeeById(supabase: SupabaseClient<Database>, organizationId: string, employeeId: string) {
  const { data, error } = await supabase.from('employees').select('*').eq('organization_id', organizationId).eq('id', employeeId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data || null) as EmployeeRow | null
}

export async function updateEmployeeRecord(supabase: SupabaseClient<Database>, organizationId: string, employeeId: string, patch: Partial<EmployeeRow>) {
  const { data, error } = await supabase.from('employees').update(patch).eq('organization_id', organizationId).eq('id', employeeId).select().single()
  if (error || !data) throw new Error(error?.message || 'Employee update returned no record.')
  return data as EmployeeRow
}
