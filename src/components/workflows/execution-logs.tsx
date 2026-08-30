"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ExecutionLogsProps {
  className?: string;
}

export const ExecutionLogs = ({ className }: ExecutionLogsProps) => {
  return (
    <div className={cn("p-4", className)}>
      <h2 className="text-xl font-bold mb-4">Execution Logs</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left rtl:text-right border-collapse">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Workflow
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Logs
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                2026-08-28 10:30:00
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                Employee Onboarding
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                Success
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                2m 30s
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                View logs
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

ExecutionLogs.displayName = "ExecutionLogs";