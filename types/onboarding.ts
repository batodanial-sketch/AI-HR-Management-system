export type OnboardingTaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'skipped'
export type OffboardingStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'
export type SigningRequestStatus = 'pending' | 'sent' | 'signed' | 'declined' | 'expired' | 'cancelled'

export type OnboardingTask = {
  id: string
  enrollmentId: string
  title: string
  description: string | null
  dueDate: string | null
  status: OnboardingTaskStatus
  sortOrder: number
}

export type OffboardingCase = {
  id: string
  employeeId: string
  effectiveDate: string
  reason: string | null
  status: OffboardingStatus
  exitInterview: Record<string, unknown>
  notes: string | null
}

export type AccessRevocation = {
  id: string
  offboardingCaseId: string
  systemName: string
  accountIdentifier: string | null
  status: 'pending' | 'revoked' | 'not_applicable' | 'failed'
  revokedAt: string | null
}
