import type { PayrollCycleRow, PayrollEntryRow, PayrollLineItemRow } from '@/src/lib/database.types'

export type PayrollLedgerRecord = {
  cycle: PayrollCycleRow
  entries: PayrollEntryRow[]
  lineItems: PayrollLineItemRow[]
}

export type PayrollValidationException = {
  severity: 'error' | 'warning' | 'info'
  employeeId?: string
  employee?: string
  issue: string
  detail: string
  recommendedAction: string
}

export type PayrollValidationResult = {
  validationStatus: 'approved' | 'exceptions' | 'blocked'
  totalGross: number
  totalNet: number
  employeeCount: number
  exceptions: PayrollValidationException[]
}
