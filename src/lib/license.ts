export const getLicenseState = async () => {
  // Placeholder implementation
  return {
    tier: "TRIAL",
    maxEmployees: 10,
    features: {
      ai: true,
      analytics: true,
      workflows: true,
    },
  };
};

export const checkLicenseFeature = async (feature: string) => {
  const license = await getLicenseState();
  return license.features[feature] || false;
};