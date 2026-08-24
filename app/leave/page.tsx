import type { Metadata } from "next";
import { getLeaveBalances, getLeaveRequests } from "@/lib/api";
import { ApprovalQueue } from "@/components/leave/approval-queue";
import { LeaveBalanceCard } from "@/components/leave/leave-balance-card";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Attendance & Leave",
};

export default async function LeavePage() {
  const balances = await getLeaveBalances();
  const requests = await getLeaveRequests();
  const myRequests = requests.slice(0, 2);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance & Leave"
        description="Manage your time off and approve team requests."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {balances.map((balance, index) => (
          <LeaveBalanceCard key={balance.type} balance={balance} index={index} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <LeaveRequestForm />
        </div>

        <div className="space-y-4 lg:col-span-3">
          <div
            data-testid="leave-my-requests"
            className="glass rounded-xl p-5"
          >
            <h3 className="text-sm font-semibold">My requests</h3>
            <div className="mt-3 space-y-3">
              {myRequests.map((request) => (
                <div
                  key={request.id}
                  data-testid="leave-request-row"
                  data-employee-id={request.employeeId}
                  data-status={request.status}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-card/40 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {request.type.toUpperCase()} · {request.startDate} → {request.endDate}
                    </p>
                    <p className="text-xs text-muted-foreground">{request.reason}</p>
                  </div>
                  <Badge variant={request.status === "approved" ? "success" : "warning"}>
                    {request.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <ApprovalQueue requests={requests} />
        </div>
      </section>
    </div>
  );
}
