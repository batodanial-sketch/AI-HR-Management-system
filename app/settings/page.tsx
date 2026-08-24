import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getEmployees, getMembers, getOrganization } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsShell } from "@/components/settings/settings-shell";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const organization = await getOrganization();
  const members = await getMembers();
  const employees = await getEmployees();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account, AI provider, branding, memory and team."
      />
      <SettingsShell
        user={user}
        organization={organization}
        members={members}
        headcount={employees.length}
      />
    </div>
  );
}
