"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCompact, formatCurrency } from "@/lib/utils";
import type { DashboardMetric } from "@/lib/types";

/**
 * Executive KPI metric card with trend sparkline and delta badge.
 */
export function KpiCard({ metric, index }: { metric: DashboardMetric; index: number }) {
  const value = formatMetricValue(metric);
  const trend = metric.delta > 0 ? "up" : metric.delta < 0 ? "down" : "flat";
  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card
        data-testid={`dashboard-stat-${metric.key}`}
        data-value={metric.value}
        className="glass group relative overflow-hidden transition-shadow hover:shadow-lg"
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="label-xs">{metric.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {value}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold",
                trend === "up" && "bg-success/15 text-success",
                trend === "down" && "bg-destructive/15 text-destructive",
                trend === "flat" && "bg-muted text-muted-foreground",
              )}
            >
              <TrendIcon className="h-3.5 w-3.5" />
              {Math.abs(metric.delta)}
              {metric.format === "percent" ? "pp" : "%"}
            </span>
          </div>
          <div className="mt-4">
            <Sparkline data={metric.spark} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{metric.deltaLabel}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function formatMetricValue(metric: DashboardMetric): string {
  if (metric.format === "currency") {
    return formatCurrency(metric.value, metric.currency ?? "USD");
  }
  if (metric.format === "percent") {
    return `${metric.value}%`;
  }
  return formatCompact(metric.value);
}
