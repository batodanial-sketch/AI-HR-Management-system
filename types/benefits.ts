export type BenefitPlanStatus = 'draft' | 'active' | 'closed' | 'archived'
export type BenefitEnrollmentStatus = 'pending' | 'enrolled' | 'waived' | 'cancelled'
export type BenefitPlan = { id: string; name: string; provider: string | null; planType: string; employeeCost: number; employerCost: number; currencyCode: string; status: BenefitPlanStatus }
export type BenefitEnrollment = { id: string; benefitPlanId: string; employeeId: string; status: BenefitEnrollmentStatus; effectiveDate: string | null }
