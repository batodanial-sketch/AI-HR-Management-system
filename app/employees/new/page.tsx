import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeForm } from "@/components/employees/employee-form";

export const metadata: Metadata = {
  title: "Add Employee",
};

export default function NewEmployeePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add employee</h1>
        <p className="text-sm text-muted-foreground">
          Create a new employee record. They will appear in the directory immediately.
        </p>
      </div>
      <Card className="glass">
        <CardHeader>
          <CardTitle>Employee details</CardTitle>
          <CardDescription>
            All fields marked are used across payroll, leave and workflows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
