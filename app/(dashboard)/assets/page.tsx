import type { Metadata } from "next";
import { getAssets } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import type { Asset } from "@/lib/domain";

export const metadata: Metadata = { title: "Assets" };

export default async function AssetsPage() {
  const assets = await getAssets();

  const columns: DataColumn<Asset>[] = [
    { key: "name", header: "Asset", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "category", header: "Category", render: (r) => r.category },
    { key: "assignee", header: "Assigned to", render: (r) => r.assignee ?? "—" },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Equipment inventory, assignments and returns."
      />
      <DataTable rows={assets} columns={columns} testId="assets-table" />
    </div>
  );
}
