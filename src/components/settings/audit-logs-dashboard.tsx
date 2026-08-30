"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AuditLogsDashboardProps {
  className?: string;
}

export const AuditLogsDashboard = ({ className }: AuditLogsDashboardProps) => {
  return (
    <div className={cn("p-4", className)}>
      <h2 className="text-xl font-bold mb-4">Audit Logs Dashboard</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left rtl:text-right border-collapse">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                2026-08-28 10:30:00
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                User Login
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                admin@example.com
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                Successful login from 192.168.1.100
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

AuditLogsDashboard.displayName = "AuditLogsDashboard";