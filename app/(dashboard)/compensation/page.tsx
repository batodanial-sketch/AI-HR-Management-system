import type { Metadata } from "next";
import { getSalaryBands } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { formatCurrency } from "@/lib/utils";
import type { SalaryBand } from "@/lib/domain";

export const metadata: Metadata = { title: "Compensation" };

export default async function CompensationPage() {
  const bands = await getSalaryBands();

  const columns: DataColumn<SalaryBand>[] = [
    { key: "level", header: "Level", mono: true, render: (r) => r.level },
    { key: "title", header: "Title", render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "min", header: "Min", align: "right", render: (r) => formatCurrency(r.min, r.currency) },
    { key: "mid", header: "Mid", align: "right", render: (r) => formatCurrency(r.mid, r.currency) },
    { key: "max", header: "Max", align: "right", render: (r) => formatCurrency(r.max, r.currency) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compensation"
        description="Salary bands and market benchmarking."
      />
      <DataTable rows={bands} columns={columns} testId="compensation-table" />
    </div>
  );
}
