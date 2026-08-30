"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AiInsightsProps {
  className?: string;
}

export const AiInsights = ({ className }: AiInsightsProps) => {
  return (
    <div className={cn("p-4", className)}>
      <h2 className="text-xl font-bold mb-4">AI Insights</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Total AI Requests</h3>
          <p className="text-lg font-bold">1,250</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Avg. Response Time</h3>
          <p className="text-lg font-bold">2.4s</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Success Rate</h3>
          <p className="text-lg font-bold">99.2%</p>
        </div>
      </div>
    </div>
  );
};

AiInsights.displayName = "AiInsights";