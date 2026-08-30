"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface StudioDashboardProps {
  className?: string;
}

export const StudioDashboard = ({ className }: StudioDashboardProps) => {
  return (
    <div className={cn("p-4", className)}>
      <h2 className="text-xl font-bold mb-4">Studio Dashboard</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Active Sessions</h3>
          <p className="text-lg font-bold">12</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Storage Used</h3>
          <p className="text-lg font-bold">2.4 GB</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Compute Time</h3>
          <p className="text-lg font-bold">4.2 hrs</p>
        </div>
      </div>
    </div>
  );
};

StudioDashboard.displayName = "StudioDashboard";