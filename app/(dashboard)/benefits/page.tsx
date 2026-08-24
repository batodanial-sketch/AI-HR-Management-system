import type { Metadata } from "next";
import { getBenefitPlans } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { formatCurrency } from "@/lib/utils";
import type { BenefitPlan } from "@/lib/domain";

export const metadata: Metadata = { title: "Benefits" };

export default async function BenefitsPage() {
  const plans = await getBenefitPlans();
  const employerCost = plans.reduce((s, p) => s + p.employerCost, 0);

  const columns: DataColumn<BenefitPlan>[] = [
    { key: "name", header: "Plan", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "provider", header: "Provider", render: (r) => r.provider },
    { key: "type", header: "Type", render: (r) => <span className="capitalize">{r.planType}</span> },
    { key: "employee", header: "Employee cost", align: "right", render: (r) => formatCurrency(r.employeeCost, "USD") },
    { key: "employer", header: "Employer cost", align: "right", render: (r) => formatCurrency(r.employerCost, "USD") },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benefits"
        description="Health, retirement and insurance plans."
      />
      <p className="label-xs">Monthly employer cost: {formatCurrency(employerCost, "USD")}</p>
      <DataTable rows={plans} columns={columns} testId="benefits-table" />
    </div>
  );
}
