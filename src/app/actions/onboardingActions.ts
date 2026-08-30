"use server";

export const startOnboarding = async (data: any) => {
  // Stub implementation
  return { id: crypto.randomUUID(), ...data };
};

export const completeOnboardingStep = async (stepId: string) => {
  // Stub implementation
  return { success: true };
};