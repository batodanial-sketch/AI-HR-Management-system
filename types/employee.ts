import type { CompensationPackageRow, DepartmentRow, EmployeeRow, JobTitleRow, LocationRow } from '@/src/lib/database.types'

export type EmployeeDirectoryRecord = {
  employee: EmployeeRow
  department: DepartmentRow | null
  jobTitle: JobTitleRow | null
  location: LocationRow | null
  compensation: CompensationPackageRow | null
}

export type CreateEmployeeInput = {
  employeeNumber: string
  firstName: string
  lastName: string
  preferredName?: string | null
  workEmail: string
  personalEmail?: string | null
  phone?: string | null
  departmentId?: string | null
  jobTitleId?: string | null
  managerId?: string | null
  locationId?: string | null
  employmentType: EmployeeRow['employment_type']
  startDate: string
  annualSalary?: number
  currencyCode?: string
}

export type EmployeeStatusUpdateInput = {
  employeeId: string
  status: EmployeeRow['status']
}

export type EmployeeDepartmentUpdateInput = {
  employeeId: string
  departmentId: string | null
}

export type EmployeeCompensationUpdateInput = {
  employeeId: string
  annualSalary: number
  currencyCode: string
  effectiveFrom: string
}
