"use server";

export const submitSurvey = async (data: any) => {
  // Stub implementation
  return { id: crypto.randomUUID(), ...data };
};

export const getSurveyResults = async (surveyId: string) => {
  // Stub implementation
  return [];
};