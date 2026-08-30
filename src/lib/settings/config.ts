export const getSiteName = () => {
  return process.env.NEXT_PUBLIC_SITE_NAME || "Fluxentiq AI HR";
};

export const getSiteDescription = () => {
  return process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "AI-powered HR management system";
};

export const getPrimaryColor = () => {
  return process.env.NEXT_PUBLIC_PRIMARY_COLOR || "#3b82f6";
};

export const getSecondaryColor = () => {
  return process.env.NEXT_PUBLIC_SECONDARY_COLOR || "#10b981";
};