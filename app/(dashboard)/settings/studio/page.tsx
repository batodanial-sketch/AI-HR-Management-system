import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { StudioDashboard } from "@/components/settings/studio-dashboard";

export const metadata: Metadata = { title: "Enterprise Studio" };

/**
 * Dynamic Enterprise Studio — schema-driven dashboard customization engine
 * gated behind FLUX-ENT Enterprise license.
 *
 * Allows admins to toggle/order widgets and configure dynamic metadata schemas.
 * All persistence via organization_configs table with RLS is_organization_admin.
 */
export default function StudioPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Enterprise Studio"
        description="Schema-driven dashboard customization and Admin Copilot — strictly gated behind FLUX-ENT Enterprise license. Customize widgets, dynamic fields, and copilot rules."
      />
      <StudioDashboard />
    </div>
  );
}
