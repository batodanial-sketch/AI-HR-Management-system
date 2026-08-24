import type { Metadata } from "next";
import { getOkrGoals, getPerformanceCycles } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OKRGoal, PerformanceCycle } from "@/lib/domain";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage() {
  const [cycles, goals] = await Promise.all([getPerformanceCycles(), getOkrGoals()]);

  const cycleColumns: DataColumn<PerformanceCycle>[] = [
    { key: "name", header: "Cycle", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "window", header: "Window", render: (r) => `${r.startDate} → ${r.endDate}` },
    { key: "participants", header: "Participants", align: "right", render: (r) => r.participants },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  const goalColumns: DataColumn<OKRGoal>[] = [
    { key: "employee", header: "Employee", render: (r) => <span className="font-medium">{r.employeeName}</span> },
    { key: "title", header: "Objective", render: (r) => `${r.title} — ${r.objective}` },
    { key: "progress", header: "Progress", align: "right", render: (r) => `${r.progress}%` },
    { key: "due", header: "Due", render: (r) => r.dueDate },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance"
        description="Review cycles, OKRs and goal tracking."
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="glass">
          <CardHeader><CardTitle className="text-sm">Active cycle</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{cycles.filter((c) => c.status === "active").length}</p></CardContent>
        </Card>
        <Card className="glass">
          <CardHeader><CardTitle className="text-sm">Goals tracked</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{goals.length}</p></CardContent>
        </Card>
        <Card className="glass">
          <CardHeader><CardTitle className="text-sm">Avg. progress</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {goals.length ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>
      <DataTable rows={cycles} columns={cycleColumns} testId="performance-cycles-table" />
      <DataTable rows={goals} columns={goalColumns} testId="okr-goals-table" />
    </div>
  );
}
