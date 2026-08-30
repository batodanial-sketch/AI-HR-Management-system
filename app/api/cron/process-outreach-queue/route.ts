import { NextRequest, NextResponse } from "next/server";
import { outreachFollowUpWorker } from "@/workers/outreachFollowUpWorker";

// Simple bearer token authentication for cron endpoints
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  throw new Error("CRON_SECRET environment variable is not set");
}

export const runtime = "nodejs";

/**
 * POST /api/cron/process-outreach-queue
 * Cron endpoint to trigger the outreach follow-up worker.
 * Protected by bearer token authentication.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check for authorization header
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.split(" ")[1]; // Format: "Bearer <token>"

  if (!token || token !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run the outreach follow-up worker
    await outreachFollowUpWorker();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to run outreach follow-up worker:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run outreach follow-up worker" },
      { status: 500 }
    );
  }
}