import { NextResponse } from "next/server";
import {
  buildCandidatesReport,
  buildDealsReport,
  buildEmployeesReport,
  buildLeadsReport,
  buildLeaveReport,
  buildSystemStatusReport,
} from "@/lib/reports";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILDERS = {
  employees: buildEmployeesReport,
  candidates: buildCandidatesReport,
  leads: buildLeadsReport,
  deals: buildDealsReport,
  leave: buildLeaveReport,
  system: buildSystemStatusReport,
} as const;

type ReportKey = keyof typeof BUILDERS;

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const key = (searchParams.get("type") ?? "employees") as ReportKey;

  const builder = BUILDERS[key];
  if (!builder) {
    return NextResponse.json(
      { ok: false, message: `Unknown report type "${key}".` },
      { status: 400 },
    );
  }

  const report = await builder();

  // Audit every export (leads, employees, payroll, …) — an export is a
  // security-relevant data-egress event that enterprise buyers must be able to
  // trace back to an actor.
  void logAuditEvent({
    action: "report.export",
    resourceType: "report",
    resourceId: key,
    metadata: { filename: report.filename, format: report.contentType },
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return new NextResponse(report.content, {
    headers: {
      "Content-Type": report.contentType,
      "Content-Disposition": `attachment; filename="${report.filename}"`,
    },
  });
}
