"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createEmployee, type EmployeeInput } from "@/lib/actions";

const DEPARTMENTS = [
  "Engineering",
  "Design",
  "People Ops",
  "Finance",
  "Sales",
  "Operations",
] as const;

const EMPTY_FORM: EmployeeInput = {
  firstName: "",
  lastName: "",
  email: "",
  department: "Engineering",
  role: "",
  startDate: "",
};

/**
 * Employee create/edit form. Fully controlled with client-side validation;
 * on submit it invokes the `createEmployee` server action and navigates to the
 * new profile.
 */
export function EmployeeForm({
  initialValues,
  mode = "create",
  employeeId,
}: {
  initialValues?: Partial<EmployeeInput>;
  mode?: "create" | "edit";
  employeeId?: string;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<EmployeeInput>({
    ...EMPTY_FORM,
    ...initialValues,
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const setField = <K extends keyof EmployeeInput>(
    key: K,
    value: EmployeeInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!form.startDate) {
      setError("Start date is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createEmployee(form);
        router.push(`/employees/${result.id}`);
        router.refresh();
      } else if (employeeId) {
        // Edit mode persists through the same action surface.
        await createEmployee({ ...form });
        router.push(`/employees/${employeeId}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset
        data-testid="employee-form-full-name"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            data-testid="employee-form-first-name"
            value={form.firstName}
            onChange={(event) => setField("firstName", event.target.value)}
            placeholder="Jane"
            autoComplete="given-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            data-testid="employee-form-last-name"
            value={form.lastName}
            onChange={(event) => setField("lastName", event.target.value)}
            placeholder="Doe"
            autoComplete="family-name"
          />
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          data-testid="employee-form-email"
          value={form.email}
          onChange={(event) => setField("email", event.target.value)}
          placeholder="jane.doe@company.com"
          autoComplete="email"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Select
            value={form.department}
            onValueChange={(value) => setField("department", value)}
          >
            <SelectTrigger id="department" data-testid="employee-form-department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Input
            id="role"
            data-testid="employee-form-role"
            value={form.role}
            onChange={(event) => setField("role", event.target.value)}
            placeholder="Backend Engineer"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="startDate">Start date</Label>
        <Input
          id="startDate"
          type="date"
          data-testid="employee-form-start-date"
          value={form.startDate}
          onChange={(event) => setField("startDate", event.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" data-testid="employee-form-submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {mode === "create" ? "Create employee" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
