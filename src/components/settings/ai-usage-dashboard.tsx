"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AiUsageDashboardProps {
  className?: string;
}

export const AiUsageDashboard = ({ className }: AiUsageDashboardProps) => {
  return (
    <div className={cn("p-4", className)}>
      <h2 className="text-xl font-bold mb-4">AI Usage Dashboard</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">Today</span>
          <span className="text-sm font-semibold">125 requests</span>
        </div>
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">This Week</span>
          <span className="text-sm font-semibold">850 requests</span>
        </div>
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">This Month</span>
          <span className="text-sm font-semibold">3,200 requests</span>
        </div>
      </div>
    </div>
  );
};

AiUsageDashboard.displayName = "AiUsageDashboard";