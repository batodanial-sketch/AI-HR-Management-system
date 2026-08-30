export const getCurrentUser = async () => {
  // Placeholder implementation
  return {
    id: "user-123",
    email: "user@example.com",
    fullName: "John Doe",
    organizationId: "org-456",
    organizationRole: "admin",
  };
};

export const isAuthenticated = async () => {
  const user = await getCurrentUser();
  return !!user;
};

export const hasPermission = async (permission: string) => {
  const user = await getCurrentUser();
  return user.organizationRole === "admin" || permission === "read";
};