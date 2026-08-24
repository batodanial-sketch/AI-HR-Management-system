import type { Metadata } from "next";
import { getWorkforceScenarios } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { formatCurrency } from "@/lib/utils";
import type { WorkforceScenario } from "@/lib/domain";

export const metadata: Metadata = { title: "Workforce Planning" };

export default async function PlanningPage() {
  const scenarios = await getWorkforceScenarios();

  const columns: DataColumn<WorkforceScenario>[] = [
    { key: "name", header: "Scenario", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "headcount", header: "Headcount", align: "right", render: (r) => r.headcountForecast },
    { key: "budget", header: "Budget", align: "right", render: (r) => formatCurrency(r.budgetForecast, "USD") },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workforce Planning"
        description="Headcount forecasting, succession and skills planning."
      />
      <DataTable rows={scenarios} columns={columns} testId="planning-table" />
    </div>
  );
}
