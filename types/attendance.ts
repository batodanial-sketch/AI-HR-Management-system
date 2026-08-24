import type { AttendanceEventRow, AttendanceRecordRow } from '@/src/lib/database.types'

export type AttendanceTelemetry = {
  record: AttendanceRecordRow
  events: AttendanceEventRow[]
}

export type ClockInInput = {
  employeeId: string
  workDate: string
  checkedInAt: string
  source?: string
  note?: string
}

export type ClockOutInput = {
  recordId: string
  checkedOutAt: string
  workedMinutes: number
  note?: string
}

export type AttendanceStatusUpdateInput = {
  recordId: string
  status: AttendanceRecordRow['status']
  note?: string
}
