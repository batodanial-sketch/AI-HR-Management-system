import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { getDocuments } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import type { DocumentRecord } from "@/lib/domain";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const documents = await getDocuments();

  const columns: DataColumn<DocumentRecord>[] = [
    {
      key: "name",
      header: "Document",
      render: (r) => (
        <span className="flex items-center gap-2 font-medium">
          <FileText className="h-4 w-4 text-muted-foreground" />
          {r.name}
        </span>
      ),
    },
    { key: "kind", header: "Kind", render: (r) => <span className="capitalize">{r.kind}</span> },
    { key: "owner", header: "Owner", render: (r) => r.owner },
    { key: "size", header: "Size", align: "right", render: (r) => `${r.sizeKb} KB` },
    { key: "uploaded", header: "Uploaded", render: (r) => r.uploadedAt },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Policies, templates and shared files."
      />
      <DataTable rows={documents} columns={columns} testId="documents-table" />
    </div>
  );
}
