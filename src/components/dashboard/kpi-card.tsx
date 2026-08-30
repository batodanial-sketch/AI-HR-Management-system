"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  change: number;
  className?: string;
}

export const KpiCard = ({ title, value, change, className }: KpiCardProps) => {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-sm text-muted-foreground">employees</span>
      </div>
      <div className="mt-2 text-xs" style={{ color: change >= 0 ? "#10b981" : "#ef4444" }}>
        {change > 0 ? "+" : ""}{change}% from last month
      </div>
    </div>
  );
};

KpiCard.displayName = "KpiCard";