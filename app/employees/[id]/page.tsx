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
  params: { id: string };
}) {
  const employees = await getEmployees();
  const employee = employees.find((item) => item.id === params.id);

  if (!employee) {
    notFound();
  }

  return <ProfileView employee={employee} />;
}
