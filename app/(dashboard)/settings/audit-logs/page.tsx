import type { Metadata } from "next";
import { getMembers } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { AuditLogsDashboard } from "@/components/settings/audit-logs-dashboard";

export const metadata: Metadata = { title: "Audit Logs" };

/**
 * Enterprise compliance dashboard — searchable, filterable, paginated view of
 * the org's `audit_logs` trail, with CSV/JSON export.
 *
 * Reads are scoped strictly to the current user's organization via
 * `listAuditLogsAction` (explicit `.eq` + RLS `is_organization_member`).
 */
export default async function AuditLogsPage() {
  const members = await getMembers();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Searchable, exportable trail of every security-relevant action in your workspace."
      />
      <AuditLogsDashboard members={members} />
    </div>
  );
}
