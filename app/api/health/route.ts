import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight liveness probe for container orchestrators.
 *
 * Deliberately dependency-free and AUTH/AGGREGATE-FREE: it returns 200 as long
 * as the Node process is serving, so a `curl -f http://localhost:3000/api/health`
 * healthcheck never fails because Supabase is unreachable or no license is
 * active. Rich subsystem status lives at `/api/system/health`.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "fluxentiq-app",
    timestamp: new Date().toISOString(),
  });
}
