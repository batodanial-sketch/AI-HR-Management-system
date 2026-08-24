export type GoalConfidence = 'on_track' | 'needs_attention' | 'at_risk'
export type GoalStatus = 'not_started' | 'in_progress' | 'at_risk' | 'completed'

export type OKRGoal = {
  id: string
  employeeId: string
  performanceCycleId: string | null
  title: string
  description: string | null
  metricType: string | null
  targetValue: number | null
  currentValue: number
  progressPercent: number
  dueDate: string | null
  status: GoalStatus | string
}

export type GoalCheckInInput = {
  goalId: string
  currentValue?: number | null
  progressPercent: number
  confidence: GoalConfidence
  blockers?: string | null
  nextSteps?: string | null
}

export type GoalCheckIn = GoalCheckInInput & {
  id: string
  employeeId: string
  checkInDate: string
  createdAt: string
}
