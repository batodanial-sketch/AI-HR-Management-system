import type { Metadata } from "next";
import { getAttendanceRecords } from "@/lib/domain";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { StatusChip } from "@/components/ui/status-chip";
import type { AttendanceRecord } from "@/lib/domain";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const records = await getAttendanceRecords();
  const present = records.filter((r) => r.status === "present" || r.status === "remote").length;

  const columns: DataColumn<AttendanceRecord>[] = [
    { key: "employee", header: "Employee", render: (r) => <span className="font-medium">{r.employeeName}</span> },
    { key: "date", header: "Date", render: (r) => r.workDate },
    { key: "in", header: "Clock in", mono: true, render: (r) => r.clockIn },
    { key: "out", header: "Clock out", mono: true, render: (r) => r.clockOut ?? "—" },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Time tracking, clock-in/out and absence monitoring."
      />
      <p className="label-xs">
        {present} of {records.length} employees present today
      </p>
      <DataTable rows={records} columns={columns} testId="attendance-table" />
    </div>
  );
}
