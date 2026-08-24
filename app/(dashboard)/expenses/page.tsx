import type { Metadata } from "next";
import { getExpenses } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/lib/domain";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const expenses = await getExpenses();
  const pending = expenses.filter((e) => e.status === "pending").length;

  const columns: DataColumn<Expense>[] = [
    { key: "employee", header: "Employee", render: (r) => <span className="font-medium">{r.employeeName}</span> },
    { key: "merchant", header: "Merchant", render: (r) => r.merchant },
    { key: "category", header: "Category", render: (r) => r.category },
    { key: "amount", header: "Amount", align: "right", render: (r) => formatCurrency(r.amount, r.currency) },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Employee reimbursements, receipts and approvals."
      />
      <p className="label-xs">{pending} awaiting approval</p>
      <DataTable rows={expenses} columns={columns} testId="expenses-table" />
    </div>
  );
}
