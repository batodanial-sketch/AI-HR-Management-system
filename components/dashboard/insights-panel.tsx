import { TrendingDown, TrendingUp, Wallet, AlertTriangle, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DashboardInsights } from "@/lib/analytics/insights";
import type { FlightRiskLevel } from "@/lib/analytics/predictive";

/**
 * Predictive insight widgets — rendered on the executive dashboard.
 *
 * Three live panels:
 *   1. Flight risk leaders — composite risk score (expense velocity × pulse
 *      eNPS × offboarding patterns) with factor chips.
 *   2. Expense anomalies — out-of-policy claims flagged BEFORE approval.
 *   3. Headcount & runway — 6-month projection from workforce scenarios plus
 *      budget/equity runway.
 */

const FLIGHT_TONE: Record<FlightRiskLevel, string> = {
  low: "text-success",
  moderate: "text-warning",
  high: "text-destructive",
  critical: "text-destructive",
};

const FLIGHT_BAR: Record<FlightRiskLevel, string> = {
  low: "bg-success",
  moderate: "bg-warning",
  high: "bg-destructive",
  critical: "bg-destructive",
};

export function InsightsPanel({ insights }: { insights: DashboardInsights }) {
  const { flightRisks, expenseAnomalies, forecast, summary } = insights;
  const riskLeaders = flightRisks.slice(0, 5);
  const anomalies = expenseAnomalies.slice(0, 5);

  return (
    <section className="space-y-4" data-testid="insights-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Predictive Insights</h2>
          <p className="text-sm text-muted-foreground">
            Cross-module signals from expenses, pulse surveys, offboarding, planning and equity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            eNPS {summary.enps ?? "—"}
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            {summary.offboardingActive} exits in motion
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ── Flight risk ─────────────────────────────────────────── */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Flight risk leaders</h3>
            <Badge variant={summary.criticalFlightRisks > 0 ? "destructive" : "outline"}>
              {summary.criticalFlightRisks} critical
            </Badge>
          </div>
          {riskLeaders.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Not enough expense data to score flight risk yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {riskLeaders.map((risk) => (
                <li key={risk.employeeName} data-testid="flight-risk-row">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{risk.employeeName}</span>
                    <span className={cn("font-semibold tabular-nums", FLIGHT_TONE[risk.level])}>
                      {risk.score}
                    </span>
                  </div>
                  <Progress
                    value={risk.score}
                    indicatorClassName={FLIGHT_BAR[risk.level]}
                    className="mt-1 h-1.5"
                  />
                  {risk.factors.length > 0 && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {risk.factors.join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Expense anomalies ───────────────────────────────────── */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Expense anomalies</h3>
            <Badge variant={summary.highSeverityAnomalies > 0 ? "destructive" : "outline"}>
              {summary.highSeverityAnomalies} high
            </Badge>
          </div>
          {anomalies.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No out-of-policy claims detected. Pending expenses are within category norms.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {anomalies.map((anomaly) => (
                <li
                  key={anomaly.id}
                  className="flex items-start justify-between gap-3 text-sm"
                  data-testid="expense-anomaly-row"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {anomaly.employeeName} · {anomaly.merchant}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{anomaly.reason}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={anomaly.severity === "high" ? "destructive" : "outline"}>
                      {anomaly.severity}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Headcount & runway ──────────────────────────────────── */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Headcount &amp; runway</h3>
            <Badge variant="outline">{forecast.scenarioCount} scenarios</Badge>
          </div>
          <div className="mt-3 space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Current headcount</span>
              <span className="text-lg font-semibold tabular-nums">
                {forecast.currentHeadcount}
              </span>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">6-month projection</p>
              <div className="flex h-16 items-end gap-1.5">
                {forecast.forecast.map((point) => {
                  const height = Math.max(
                    8,
                    Math.round(
                      (point.headcount /
                        Math.max(...forecast.forecast.map((p) => p.headcount), 1)) *
                        100,
                    ),
                  );
                  return (
                    <div key={point.month} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-primary/80"
                        style={{ height: `${height}%` }}
                        title={`Month ${point.month}: ${point.headcount}`}
                      />
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        M{point.month}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {forecast.monthlyGrowthRate >= 0 ? (
                  <TrendingUp className="mr-1 inline h-3 w-3 text-success" />
                ) : (
                  <TrendingDown className="mr-1 inline h-3 w-3 text-destructive" />
                )}
                {(forecast.monthlyGrowthRate * 100).toFixed(1)}% monthly growth
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border p-2.5">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Wallet className="h-3 w-3" /> Budget pool
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCompact(forecast.budgetPool)}
                </p>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" /> Runway
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {forecast.runwayMonths === null
                    ? "—"
                    : `${forecast.runwayMonths} mo`}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${Math.round(value)}`;
}
