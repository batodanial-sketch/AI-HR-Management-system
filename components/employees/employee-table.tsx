"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpDown,
  MoreHorizontal,
  Pencil,
  Search,
  UserRoundX,
} from "lucide-react";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import type { Employee, EmploymentStatus } from "@/lib/types";
import { StatusBadge } from "./status-badge";

const DEPARTMENTS = [
  "All",
  "Engineering",
  "Design",
  "People Ops",
  "Finance",
  "Sales",
] as const;

type SortKey = "name" | "startDate" | "department";

/**
 * Employee directory: search + department filter + sortable data table with
 * per-row actions (view, edit, offboard).
 */
export function EmployeeTable({
  employees,
  canManage = false,
}: {
  employees: Employee[];
  canManage?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [department, setDepartment] = React.useState<string>("All");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortAsc, setSortAsc] = React.useState(true);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = employees.filter((employee) => {
      const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
      const matchesQuery =
        normalized.length === 0 ||
        fullName.includes(normalized) ||
        employee.email.toLowerCase().includes(normalized);
      const matchesDepartment =
        department === "All" || employee.department === department;
      return matchesQuery && matchesDepartment;
    });

    result.sort((a, b) => {
      let comparison = 0;
      if (sortKey === "name") {
        comparison = `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        );
      } else if (sortKey === "startDate") {
        comparison = a.startDate.localeCompare(b.startDate);
      } else {
        comparison = a.department.localeCompare(b.department);
      }
      return sortAsc ? comparison : -comparison;
    });
    return result;
  }, [employees, query, department, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="employee-directory-search"
            placeholder="Search by name or email…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-card/60 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEPARTMENTS.map((item) => (
            <button
              key={item}
              onClick={() => setDepartment(item)}
              className={cn(
                "rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors",
                department === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card/40 text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        data-testid="employee-directory-table"
        className="glass overflow-hidden rounded-lg"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <SortableHeader
                  label="Employee"
                  active={sortKey === "name"}
                  onClick={() => toggleSort("name")}
                />
                <SortableHeader
                  label="Department"
                  active={sortKey === "department"}
                  onClick={() => toggleSort("department")}
                  className="hidden md:table-cell"
                />
                <th className="px-4 py-3 font-medium">Role</th>
                <SortableHeader
                  label="Start date"
                  active={sortKey === "startDate"}
                  onClick={() => toggleSort("startDate")}
                  className="hidden lg:table-cell"
                />
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((employee) => (
                  <motion.tr
                    key={employee.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    data-testid="employee-row"
                    className="group border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/employees/${employee.id}`}
                        className="flex items-center gap-3"
                      >
                        <NameAvatar
                          name={`${employee.firstName} ${employee.lastName}`}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {employee.firstName} {employee.lastName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {employee.email}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {employee.department}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {employee.title}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {formatDate(employee.startDate)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={employee.employmentStatus} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowActions employee={employee} canManage={canManage} />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div
            data-testid="employee-directory-empty"
            className="flex flex-col items-center justify-center gap-2 py-16 text-center"
          >
            <p className="text-sm font-medium">No employees found</p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search or filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("px-4 py-3 font-medium", className)}>
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}

function RowActions({
  employee,
  canManage,
}: {
  employee: Employee;
  canManage: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/employees/${employee.id}`}>
            <Pencil className="mr-2 h-4 w-4" /> View profile
          </Link>
        </DropdownMenuItem>
        {canManage && employee.employmentStatus !== "terminated" && (
          <DropdownMenuItem asChild>
            <Link href={`/employees/${employee.id}?action=offboard`}>
              <UserRoundX className="mr-2 h-4 w-4" /> Offboard
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
