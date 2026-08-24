import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron endpoint — invoke on a schedule (systemd timer / K8s CronJob / hosted
 * cron). Runs all due scheduled jobs. Idempotent and safe to call frequently.
 *
 * SECURITY: fail-closed. Without CRON_SECRET the endpoint is disabled entirely
 * (returns 503) so a misconfigured deployment can never be triggered by
 * unauthenticated callers. The token comparison is constant-time.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const token = process.env.CRON_SECRET;

  // Fail closed — no token means no cron access, period.
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const header = request.headers.get("x-cron-secret") ?? "";

  // Constant-time comparison to avoid leaking the secret via timing.
  const tokenBuf = Buffer.from(token);
  const headerBuf = Buffer.from(header);
  const valid =
    tokenBuf.length === headerBuf.length && timingSafeEqual(tokenBuf, headerBuf);

  if (!valid) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const executed = await runDueJobs();
  return NextResponse.json({ ok: true, executed });
}
