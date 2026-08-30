"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SystemHealthProps {
  className?: string;
}

export const SystemHealth = ({ className }: SystemHealthProps) => {
  return (
    <div className={cn("p-4", className)}>
      <h2 className="text-xl font-bold mb-4">System Health</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">CPU Usage</h3>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-green-500 h-2.5 rounded-full" style={{ width: "45%" }}></div>
          </div>
          <p className="mt-2 text-sm text-gray-600">45%</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Memory Usage</h3>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: "62%" }}></div>
          </div>
          <p className="mt-2 text-sm text-gray-600">62%</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Disk Usage</h3>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: "78%" }}></div>
          </div>
          <p className="mt-2 text-sm text-gray-600">78%</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Network I/O</h3>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-red-500 h-2.5 rounded-full" style={{ width: "33%" }}></div>
          </div>
          <p className="mt-2 text-sm text-gray-600">33%</p>
        </div>
      </div>
    </div>
  );
};

SystemHealth.displayName = "SystemHealth";