import type { Metadata } from "next";
import { getPulseSurveys } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { Badge } from "@/components/ui/badge";
import type { PulseSurvey } from "@/lib/domain";

export const metadata: Metadata = { title: "Surveys" };

export default async function SurveysPage() {
  const surveys = await getPulseSurveys();

  const columns: DataColumn<PulseSurvey>[] = [
    { key: "title", header: "Survey", render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "anonymous", header: "Anonymous", render: (r) => (r.anonymous ? <Badge variant="secondary">Yes</Badge> : <Badge variant="outline">No</Badge>) },
    { key: "responses", header: "Responses", align: "right", render: (r) => r.responses },
    { key: "enps", header: "eNPS", align: "right", render: (r) => (r.eNPS == null ? "—" : (r.eNPS > 0 ? `+${r.eNPS}` : r.eNPS)) },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pulse Surveys"
        description="Engagement, eNPS and sentiment collection."
      />
      <DataTable rows={surveys} columns={columns} testId="surveys-table" />
    </div>
  );
}
