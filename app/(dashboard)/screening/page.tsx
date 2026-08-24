import type { Metadata } from "next";
import { getScreeningRecords } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";
import type { ScreeningRecord } from "@/lib/domain";

export const metadata: Metadata = { title: "Screening" };

export default async function ScreeningPage() {
  const records = await getScreeningRecords();

  const columns: DataColumn<ScreeningRecord>[] = [
    { key: "candidate", header: "Candidate", render: (r) => <span className="font-medium">{r.candidateName}</span> },
    { key: "role", header: "Role", render: (r) => r.role },
    {
      key: "score",
      header: "Score",
      align: "right",
      render: (r) => (
        <span
          className={cn(
            "font-bold tabular-nums",
            r.score >= 85 ? "text-success" : r.score >= 70 ? "text-primary" : "text-warning",
          )}
        >
          {r.score}
        </span>
      ),
    },
    { key: "recommendation", header: "Recommendation", render: (r) => <StatusChip value={r.recommendation} /> },
    { key: "date", header: "Reviewed", render: (r) => r.reviewedAt },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Screening"
        description="Automated candidate screening and match scores."
      />
      <DataTable rows={records} columns={columns} testId="screening-table" />
    </div>
  );
}
