"use server";

export const calculatePayroll = async (data: any) => {
  // Stub implementation
  return { id: crypto.randomUUID(), ...data };
};

export const runGlobalPayroll = async (data: any) => {
  // Stub implementation
  return { success: true };
};