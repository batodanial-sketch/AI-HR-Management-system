import type { Metadata } from "next";
import { getAuditEntries } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";
import type { AuditEntry } from "@/lib/domain";

export const metadata: Metadata = { title: "Audit Logs" };

export default async function AuditLogsPage() {
  const entries = await getAuditEntries();

  const columns: DataColumn<AuditEntry>[] = [
    { key: "actor", header: "Actor", render: (r) => <span className="font-medium">{r.actor}</span> },
    { key: "action", header: "Action", mono: true, render: (r) => r.action },
    { key: "entity", header: "Entity", render: (r) => <span className="capitalize">{r.entityType}</span> },
    { key: "id", header: "Entity ID", mono: true, render: (r) => r.entityId },
    { key: "time", header: "Time", render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Tamper-evident trail of every system mutation."
      />
      <DataTable rows={entries} columns={columns} testId="audit-logs-table" />
    </div>
  );
}
