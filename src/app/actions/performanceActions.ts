"use server";

export const summarizePerformanceData = async (data: any) => {
  // Stub implementation
  return { summary: "Data summarized successfully" };
};

export const createPerformanceReview = async (data: any) => {
  // Stub implementation
  return { id: crypto.randomUUID(), ...data };
};