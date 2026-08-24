import type { Metadata } from "next";
import { ColumnChart } from "@/components/charts/bar-columns";
import { DistributionChart } from "@/components/charts/bar-row";
import { ChartCard } from "@/components/analytics/chart-card";
import { AiInsightsPanel } from "@/components/analytics/ai-insights";
import { PageHeader } from "@/components/layout/page-header";
import {
  analyticsHeadcount,
  analyticsPayrollDistribution,
  analyticsTimeToHire,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Workforce, spend and hiring metrics at a glance."
      />

      <div data-testid="analytics-dashboard" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          chartKey="headcount"
          title="Headcount growth"
          description="Total employees over the last 7 months"
        >
          <ColumnChart data={analyticsHeadcount} />
        </ChartCard>

        <ChartCard
          chartKey="payroll"
          title="Payroll distribution"
          description="Share of payroll spend by department"
        >
          <DistributionChart data={analyticsPayrollDistribution} />
        </ChartCard>

        <ChartCard
          chartKey="recruitment"
          title="Time to hire"
          description="Average days from application to offer"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <ColumnChart data={analyticsTimeToHire} />
            <div className="space-y-2 text-sm">
              <MetricRow label="Current" value="20 days" accent />
              <MetricRow label="3-month trend" value="−14 days" />
              <MetricRow label="Industry benchmark" value="28 days" />
            </div>
          </div>
        </ChartCard>

        <ChartCard
          chartKey="attrition"
          title="Attrition rate"
          description="Voluntary turnover, trailing 12 months"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-3 gap-4 text-center">
            <InlineStat label="Attrition" value="8.4%" tone="success" />
            <InlineStat label="Regrettable" value="3.1%" tone="warning" />
            <InlineStat label="eNPS" value="+42" tone="accent" />
          </div>
        </ChartCard>

        <ChartCard
          chartKey="leave"
          title="Leave utilization"
          description="PTO taken vs. available this year"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-3 gap-4 text-center">
            <InlineStat label="PTO used" value="68%" tone="accent" />
            <InlineStat label="Sick used" value="21%" tone="success" />
            <InlineStat label="Carryover" value="11%" tone="warning" />
          </div>
        </ChartCard>
      </div>

      <AiInsightsPanel
        headcount={analyticsHeadcount}
        payrollDistribution={analyticsPayrollDistribution}
        timeToHire={analyticsTimeToHire}
      />
    </div>
  );
}

function MetricRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-8">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function InlineStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "accent";
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    accent: "text-primary",
  }[tone];
  return (
    <div className="glass rounded-xl p-4">
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
