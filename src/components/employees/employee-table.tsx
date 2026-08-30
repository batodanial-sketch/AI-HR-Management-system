"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";

interface EmployeeTableProps {
  employees: any[];
  className?: string;
}

export const EmployeeTable = ({ employees, className }: EmployeeTableProps) => {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm text-left rtl:text-right border-collapse">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Department
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {employee.firstName} {employee.lastName}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {employee.email}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {employee.role}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {employee.department}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <StatusChip variant="default">Active</StatusChip>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <Button variant="ghost" size="sm">View</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

EmployeeTable.displayName = "EmployeeTable";