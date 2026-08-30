"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps {
  value: number;
  className?: string;
}

export const Progress = ({ value, className }: ProgressProps) => {
  return (
    <div className={cn("w-full bg-gray-200 rounded-full h-2.5", className)}>
      <div
        className="bg-blue-600 h-2.5 rounded-full"
        style={{ width: `${value}%` }}
      ></div>
    </div>
  );
};

Progress.displayName = "Progress";