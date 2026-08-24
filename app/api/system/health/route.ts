import { NextResponse } from "next/server";
import { getHealthReport } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const report = await getHealthReport();
  const status =
    report.status === "ok" ? 200 : report.status === "degraded" ? 200 : 503;
  return NextResponse.json(report, { status });
}
