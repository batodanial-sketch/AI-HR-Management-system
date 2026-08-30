"use server";

export const submitExpense = async (data: any) => {
  // Stub implementation
  return { id: crypto.randomUUID(), ...data };
};