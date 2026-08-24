"use client";

import * as React from "react";
import { Loader2, Play, TrendingUp } from "lucide-react";
import { executePayrollRun } from "@/lib/actions";
import { useUser } from "@/components/providers";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { supportedCurrencies } from "@/lib/data";
import type { CurrencyCode, PayrollLineItem, PayrollRun } from "@/lib/types";

const STATUS_VARIANT: Record<PayrollRun["status"], "secondary" | "warning" | "success" | "destructive"> = {
  draft: "secondary",
  processing: "warning",
  completed: "success",
  failed: "destructive",
};

/**
 * Global payroll engine: run configuration, multi-currency display toggle,
 * auto-calculated line-item breakdown (net = gross − deductions) and run
 * execution status indicators.
 */
export function PayrollView({
  runs,
  lineItems,
}: {
  runs: PayrollRun[];
  lineItems: PayrollLineItem[];
}) {
  const user = useUser();
  const canManage = user.role === "owner" || user.role === "admin";
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");
  const [executingId, setExecutingId] = React.useState<string | null>(null);
  const [runStates, setRunStates] = React.useState<Record<string, PayrollRun["status"]>>(
    () => Object.fromEntries(runs.map((run) => [run.id, run.status])),
  );

  const visibleRuns = runs.filter((run) => run.currency === currency);
  const activeRun = visibleRuns[0];
  const visibleLines = activeRun
    ? lineItems.filter((item) => item.payrollRunId === activeRun.id)
    : [];

  const executeRun = async (runId: string) => {
    setExecutingId(runId);
    setRunStates((prev) => ({ ...prev, [runId]: "processing" }));
    await executePayrollRun(runId);
    setRunStates((prev) => ({ ...prev, [runId]: "completed" }));
    setExecutingId(null);
  };

  const totals = visibleLines.reduce(
    (acc, item) => ({
      gross: acc.gross + item.grossPay,
      deductions: acc.deductions + item.deductions,
      net: acc.net + item.netPay,
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Run configuration + currency */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <p className="label-xs">Currency</p>
            <div className="flex items-center gap-2">
              <Select
                value={currency}
                onValueChange={(value) => setCurrency(value as CurrencyCode)}
              >
                <SelectTrigger
                  data-testid="payroll-currency-select"
                  className="w-32"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedCurrencies.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span
                data-testid="payroll-currency-indicator"
                data-currency={currency}
                className="text-xs text-muted-foreground"
              >
                Displaying {currency}
              </span>
            </div>
          </div>
        </div>

        {canManage && activeRun && (
          <Button
            data-testid="payroll-run-button"
            onClick={() => void executeRun(activeRun.id)}
            disabled={runStates[activeRun.id] === "completed" || executingId === activeRun.id}
          >
            {executingId === activeRun.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {runStates[activeRun.id] === "completed"
              ? "Run completed"
              : "Execute payroll run"}
          </Button>
        )}
      </div>

      {/* Run status summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Gross pay" value={formatCurrency(totals.gross, currency)} />
        <StatCard label="Deductions" value={formatCurrency(totals.deductions, currency)} />
        <StatCard
          label="Net pay"
          value={formatCurrency(totals.net, currency)}
          highlight
        />
      </div>

      {/* Runs */}
      <div className="space-y-3">
        {visibleRuns.map((run) => (
          <div
            key={run.id}
            data-testid="payroll-run-row"
            data-run-id={run.id}
            className="glass flex items-center justify-between rounded-xl px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {formatDate(run.periodStart)} → {formatDate(run.periodEnd)}
                </p>
                <p className="text-xs text-muted-foreground">{run.currency} run</p>
              </div>
            </div>
            <Badge
              data-testid="payroll-run-status"
              data-status={runStates[run.id] ?? run.status}
              variant={STATUS_VARIANT[runStates[run.id] ?? run.status]}
            >
              {runStates[run.id] ?? run.status}
            </Badge>
          </div>
        ))}
      </div>

      {/* Line items */}
      <div className="glass overflow-hidden rounded-xl">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Line items</h3>
          <p className="text-xs text-muted-foreground">
            Net pay is auto-calculated from gross − deductions.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Employee</th>
                <th className="px-5 py-3 text-right font-medium">Gross</th>
                <th className="px-5 py-3 text-right font-medium">Deductions</th>
                <th className="px-5 py-3 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((item) => (
                <tr
                  key={item.id}
                  data-testid="payroll-line-row"
                  data-employee-id={item.employeeId}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <NameAvatar name={item.employeeName} className="h-7 w-7" />
                      <span className="font-medium">{item.employeeName}</span>
                    </div>
                  </td>
                  <td
                    data-testid="payroll-line-gross"
                    data-value={item.grossPay}
                    className="px-5 py-3 text-right tabular-nums"
                  >
                    {formatCurrency(item.grossPay, currency)}
                  </td>
                  <td
                    data-testid="payroll-line-deductions"
                    data-value={item.deductions}
                    className="px-5 py-3 text-right tabular-nums text-destructive"
                  >
                    −{formatCurrency(item.deductions, currency)}
                  </td>
                  <td
                    data-testid="payroll-line-net"
                    data-value={item.netPay}
                    className="px-5 py-3 text-right font-semibold tabular-nums"
                  >
                    {formatCurrency(item.netPay, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass rounded-xl p-5",
        highlight && "ring-hairline border-primary/30",
      )}
    >
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          "mt-2 text-xl font-bold tabular-nums",
          highlight && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}
