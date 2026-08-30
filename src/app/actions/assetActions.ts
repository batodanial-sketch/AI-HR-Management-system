"use server";

export const assignAsset = async (assetId: string, employeeId: string) => {
  // Placeholder implementation
  return {
    id: Math.random().toString(36).substr(2, 9),
    assetId,
    employeeId,
    assignedAt: new Date().toISOString(),
  };
};

export const getAssetHistory = async (assetId: string) => {
  // Placeholder implementation
  return [];
};