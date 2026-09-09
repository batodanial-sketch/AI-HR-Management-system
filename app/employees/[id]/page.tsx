import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEmployees } from "@/lib/api";
import { ProfileView } from "@/components/employees/profile-view";

export const metadata: Metadata = {
  title: "Employee Profile",
};

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employees = await getEmployees();
  const { id } = await params;
  const employee = employees.find((item) => item.id === id);

  if (!employee) {
    notFound();
  }

  return <ProfileView employee={employee} />;
}
