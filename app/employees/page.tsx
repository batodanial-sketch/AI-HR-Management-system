import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getEmployees } from "@/lib/api";
import { EmployeeTable } from "@/components/employees/employee-table";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Employee Directory",
};

export default async function EmployeesPage() {
  const employees = await getEmployees();
  const user = await getCurrentUser();
  const canManage = isAdmin(user);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Directory"
        description={`${employees.length} people across your organization.`}
        actions={
          canManage ? (
            <Button asChild data-testid="employee-add-button">
              <Link href="/employees/new">
                <UserPlus className="h-4 w-4" /> Add employee
              </Link>
            </Button>
          ) : undefined
        }
      />
      <EmployeeTable employees={employees} canManage={canManage} />
    </div>
  );
}
