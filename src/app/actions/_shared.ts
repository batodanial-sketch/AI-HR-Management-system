import { getCurrentUser } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

export const requireOrganizationContext = async (permission: string) => {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized", status: 401 };
  const orgId = getOrganizationId(user);
  if (!orgId) return { success: false, error: "Organization not found", status: 404 };
  // Additional permission checks can be added here
  return { success: true, data: { organizationId: orgId, userId: user.id } };
};

export const actionWrapper = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred",
      status: 500,
    };
  }
};