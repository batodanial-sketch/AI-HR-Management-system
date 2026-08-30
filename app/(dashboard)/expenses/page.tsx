import type { Metadata } from "next";
import { getExpenses } from "@/lib/domain";
import { getCurrentUser } from "@/lib/auth";
import { detectExpenseAnomalies } from "@/lib/analytics/predictive";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import { formatCurrency } from "@/lib/utils";
import { RealtimeRefresher } from "@/components/module/realtime-refresher";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { Expense } from "@/lib/domain";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const user = await getCurrentUser();
  const expenses = await getExpenses();
  const anomalies = detectExpenseAnomalies(expenses);
  const pendingAnomalies = anomalies.filter((anomaly) =>
    expenses.some(
      (expense) => expense.id === anomaly.expenseId && expense.status === "pending",
    ),
  );
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
      <RealtimeRefresher
        tables={["expense_reports"]}
        label="Expenses"
        organizationId={user.organizationId}
      />
      <PageHeader
        title="Expenses"
        description="Employee reimbursements, receipts and approvals."
      />
      {pendingAnomalies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm">
            <span className="font-medium text-destructive">
              {pendingAnomalies.length} pending claim{pendingAnomalies.length === 1 ? "" : "s"} flagged
            </span>{" "}
            before approval:
          </p>
          {pendingAnomalies.slice(0, 4).map((anomaly) => (
            <Badge key={anomaly.id} variant="outline" className="gap-1 text-destructive">
              {anomaly.employeeName} · {anomaly.merchant}
            </Badge>
          ))}
        </div>
      )}
      <p className="label-xs">{pending} awaiting approval</p>
      <DataTable rows={expenses} columns={columns} testId="expenses-table" />
    </div>
  );
}
