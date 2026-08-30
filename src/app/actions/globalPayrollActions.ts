"use server";

export const getGlobalPayrollRun = async (id: string) => {
  // Stub implementation
  return { id, status: "completed" };
};

export const triggerGlobalPayrollRun = async (data: any) => {
  // Stub implementation
  return { id: crypto.randomUUID(), ...data };
};