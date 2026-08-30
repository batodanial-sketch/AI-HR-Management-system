"use server";

export const getStudioData = async () => {
  // Placeholder implementation
  return {
    sessions: 12,
    storageUsed: "2.4 GB",
    computeTime: "4.2 hrs",
  };
};

export const createStudioSession = async (input: { name: string; type: string }) => {
  // Placeholder implementation
  return {
    id: Math.random().toString(36).substr(2, 9),
    name: input.name,
    type: input.type,
    createdAt: new Date().toISOString(),
  };
};