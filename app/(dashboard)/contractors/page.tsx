import type { Metadata } from "next";
import { getContractorInvoices } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { formatCurrency } from "@/lib/utils";
import type { ContractorInvoice } from "@/lib/domain";

export const metadata: Metadata = { title: "Contractors" };

export default async function ContractorsPage() {
  const invoices = await getContractorInvoices();

  const columns: DataColumn<ContractorInvoice>[] = [
    { key: "contractor", header: "Contractor", render: (r) => <span className="font-medium">{r.contractor}</span> },
    { key: "number", header: "Invoice", mono: true, render: (r) => r.invoiceNumber },
    { key: "amount", header: "Amount", align: "right", render: (r) => formatCurrency(r.totalAmount, r.currency) },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contractors"
        description="Invoices, approvals and compliance for external workers."
      />
      <DataTable rows={invoices} columns={columns} testId="contractors-table" />
    </div>
  );
}
