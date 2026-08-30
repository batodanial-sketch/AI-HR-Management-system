"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const employeeFormSchema = z.object({
  firstName: z.string().min(2, {
    message: "First name must be at least 2 characters.",
  }),
  lastName: z.string().min(2, {
    message: "Last name must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Invalid email address.",
  }),
  department: z.string().min(2, {
    message: "Department must be at least 2 characters.",
  }),
  role: z.string().min(2, {
    message: "Role must be at least 2 characters.",
  }),
  startDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/, {
    message: "Date must be YYYY-MM-DD format.",
  }),
});

export function EmployeeForm() {
  const form = useForm<z.infer<typeof employeeFormSchema>>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      department: "",
      role: "",
      startDate: "",
    },
  });

  function onSubmit(values: z.infer<typeof employeeFormSchema>) {
    // Do something with the form values.
    // onSubmit has been submitted with:', values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>First Name</FormLabel>
              <Input {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name</FormLabel>
              <Input {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <Input {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="department"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Department</FormLabel>
              <Input {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Input {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="startDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Start Date</FormLabel>
              <Input type="date" {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Add Employee</Button>
      </form>
    </Form>
  );
}
