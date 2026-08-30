"use server";

export const getForecast = async (data: any) => {
  // Stub implementation
  return { forecast: "Predicted data" };
};

export const trainModel = async (data: any) => {
  // Stub implementation
  return { modelId: crypto.randomUUID() };
};