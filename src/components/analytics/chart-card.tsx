"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

export const ChartCard = ({ title, description, className, children }: ChartCardProps) => {
  return (
    <div className={cn("bg-card text-card-foreground shadow-sm rounded-lg border", className)}>
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
};

ChartCard.displayName = "ChartCard";