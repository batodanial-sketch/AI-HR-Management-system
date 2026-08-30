"use server";

export const requestLeave = async (data: any) => {
  // Stub implementation
  return {
    id: crypto.randomUUID(),
    status: 'pending',
    ...data,
  };
};

export const approveLeave = async (id: string) => {
  // Stub implementation
  return { success: true };
};