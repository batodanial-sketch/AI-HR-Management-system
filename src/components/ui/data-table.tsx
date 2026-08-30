"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DataColumn<T = any> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "center" | "right";
  mono?: boolean;
}

interface DataTableProps<T extends object> {
  className?: string;
  rows: T[];
  columns: DataColumn<T>[];
  testId?: string;
  testId?: string;
}

export const DataTable = <T,>({ className, rows, columns, testId }: DataTableProps<T>) => {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm text-left rtl:text-right border-collapse" data-testid={testId}>
        <thead>
          <tr className="border-b">
            {columns.map((col) => (
              <th key={col.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className={cn("px-6 py-4 whitespace-nowrap text-sm text-gray-900", col.mono && "font-mono", col.align === "right" && "text-right")}>
                  {col.render ? col.render(row) : String(row[col.key as keyof T])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

DataTable.displayName = "DataTable";
