"use server";

export const screenCandidate = async (data: any) => {
  // Stub implementation
  return { id: crypto.randomUUID(), ...data };
};

export const updateScreeningResult = async (id: string, result: any) => {
  // Stub implementation
  return { success: true };
};