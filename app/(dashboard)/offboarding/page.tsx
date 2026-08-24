import type { Metadata } from "next";
import { getOffboardingCases } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { Progress } from "@/components/ui/progress";
import type { OffboardingCase } from "@/lib/domain";

export const metadata: Metadata = { title: "Offboarding" };

export default async function OffboardingPage() {
  const cases = await getOffboardingCases();

  const columns: DataColumn<OffboardingCase>[] = [
    { key: "employee", header: "Employee", render: (r) => <span className="font-medium">{r.employeeName}</span> },
    { key: "exit", header: "Exit date", render: (r) => r.exitDate },
    {
      key: "progress",
      header: "Progress",
      render: (r) => (
        <div className="flex w-40 items-center gap-2">
          <Progress value={r.tasksTotal ? Math.round((r.tasksDone / r.tasksTotal) * 100) : 0} />
          <span className="text-xs tabular-nums text-muted-foreground">
            {r.tasksDone}/{r.tasksTotal}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offboarding"
        description="Exit interviews, access revocation and task checklists."
      />
      <DataTable rows={cases} columns={columns} testId="offboarding-table" />
    </div>
  );
}
