"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TemplateBuilderProps {
  className?: string;
}

export const TemplateBuilder = ({ className }: TemplateBuilderProps) => {
  return (
    <div className={cn("p-4", className)}>
      <h2 className="text-xl font-bold mb-4">Template Builder</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">Active Templates</span>
          <span className="text-sm font-semibold">12</span>
        </div>
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">Templates Used Today</span>
          <span className="text-sm font-semibold">5</span>
        </div>
        <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <span className="text-sm font-medium">Avg. Completion Time</span>
          <span className="text-sm font-semibold">15m</span>
        </div>
      </div>
    </div>
  );
};

TemplateBuilder.displayName = "TemplateBuilder";