"use server";

import { getCurrentUser } from "@/lib/auth";

export interface BenefitEnrollment {
  id: string;
  employeeId: string;
  benefitId: string;
  status: string;
  enrolledAt: string;
}

export async function enrollInBenefit(data: {
  employeeId: string;
  benefitId: string;
  options?: Record<string, any>;
}): Promise<BenefitEnrollment> {
  const user = await getCurrentUser();
  // In real implementation, check permissions and create enrollment in Supabase
  return {
    id: crypto.randomUUID(),
    employeeId: data.employeeId,
    benefitId: data.benefitId,
    status: "active",
    enrolledAt: new Date().toISOString(),
  };
}

export async function getBenefitEnrollments(employeeId: string): Promise<BenefitEnrollment[]> {
  // In real implementation, fetch from Supabase
  return [];
}