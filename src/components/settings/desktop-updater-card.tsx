"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DesktopUpdaterCardProps {
  className?: string;
  version?: string;
  isUpToDate?: boolean;
}

export const DesktopUpdaterCard = ({
  className,
  version = "1.0.0",
  isUpToDate = true,
}: DesktopUpdaterCardProps) => {
  return (
    <div className={cn("bg-white rounded-lg shadow p-4", className)}>
      <h3 className="font-semibold mb-2">Desktop Updater</h3>
      <div className="flex items-center justify-between text-sm">
        <span>Current Version:</span>
        <span className="font-medium">{version}</span>
      </div>
      <div className="flex items-center justify-between text-sm mt-2">
        <span>Status:</span>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            isUpToDate ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          )}
        >
          {isUpToDate ? "Up to date" : "Update available"}
        </span>
      </div>
      {!isUpToDate && (
        <button
          className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            // Placeholder for update logic
            alert("Update initiated");
          }}
        >
          Update Now
        </button>
      )}
    </div>
  );
};

DesktopUpdaterCard.displayName = "DesktopUpdaterCard";