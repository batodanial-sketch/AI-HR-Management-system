import type { Metadata } from "next";
import { getEquityGrants } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import type { EquityGrant } from "@/lib/domain";

export const metadata: Metadata = { title: "Equity" };

export default async function EquityPage() {
  const grants = await getEquityGrants();
  const totalShares = grants.filter((g) => g.grantType === "rsu" || g.grantType === "share")
    .reduce((s, g) => s + g.quantity, 0);

  const columns: DataColumn<EquityGrant>[] = [
    { key: "employee", header: "Employee", render: (r) => <span className="font-medium">{r.employeeName}</span> },
    { key: "type", header: "Type", render: (r) => <span className="uppercase">{r.grantType}</span> },
    { key: "quantity", header: "Quantity", align: "right", render: (r) => r.quantity.toLocaleString() },
    { key: "strike", header: "Strike price", align: "right", render: (r) => (r.strikePrice ? `$${r.strikePrice}` : "—") },
    { key: "vesting", header: "Vesting", align: "right", render: (r) => `${r.vestingMonths} mo` },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equity"
        description="Stock options, RSUs and vesting schedules."
      />
      <p className="label-xs">{totalShares.toLocaleString()} total shares/units granted</p>
      <DataTable rows={grants} columns={columns} testId="equity-table" />
    </div>
  );
}
