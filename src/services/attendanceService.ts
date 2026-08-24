import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AttendanceRecordRow, Database } from '@/src/lib/supabase'

export async function findAttendanceRecords(supabase: SupabaseClient<Database>, organizationId: string, workDate?: string) {
  let query = supabase.from('attendance_records').select('*').eq('organization_id', organizationId).order('work_date', { ascending: false })
  if (workDate) query = query.eq('work_date', workDate)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data || []) as AttendanceRecordRow[]
}

export async function upsertAttendanceRecord(supabase: SupabaseClient<Database>, record: Partial<AttendanceRecordRow>) {
  const { data, error } = await supabase.from('attendance_records').upsert(record, { onConflict: 'employee_id,work_date' }).select().single()
  if (error || !data) throw new Error(error?.message || 'Attendance upsert returned no record.')
  return data as AttendanceRecordRow
}
