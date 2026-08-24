import type { Metadata } from "next";
import { getPayrollLineItems, getPayrollRuns } from "@/lib/api";
import { PayrollView } from "@/components/payroll/payroll-view";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Payroll",
};

export default async function PayrollPage() {
  const runs = await getPayrollRuns();
  const lineItems = await Promise.all(
    runs.map((run) => getPayrollLineItems(run.id)),
  ).then((groups) => groups.flat());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Configure, execute and audit global payroll runs across currencies."
      />
      <PayrollView runs={runs} lineItems={lineItems} />
    </div>
  );
}
