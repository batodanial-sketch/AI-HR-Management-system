import "server-only";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getLicenseState } from "@/lib/license";
import { daysRemaining } from "@/lib/license-format";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import type { Json } from "@/lib/database.types";

/**
 * Scheduler — a lightweight, cron-style job runner.
 *
 * Production deployments invoke `/api/system/cron` on a schedule (systemd
 * timer, Kubernetes CronJob, or a hosted cron pinging the endpoint). Each run
 * claims due jobs and executes their handler. Self-contained and idempotent.
 */

export type JobType = "trial_expiry" | "payroll_reminder" | "report";

interface DueJob {
  id: string;
  job_type: JobType;
  payload: Record<string, unknown>;
}

export async function enqueueJob(input: {
  jobType: JobType;
  runAt: Date;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!hasSupabaseEnv()) {
    console.info(`[scheduler] enqueue ${input.jobType} at ${input.runAt.toISOString()}`);
    return;
  }
  const user = await getCurrentUser();
  await serverClient().from("scheduled_jobs").insert({
    organization_id: user.organizationId ?? null,
    job_type: input.jobType,
    payload: (input.payload ?? {}) as Json,
    run_at: input.runAt.toISOString(),
  });
}

/** Claims and runs all due jobs. Returns the number executed. */
export async function runDueJobs(): Promise<number> {
  if (!hasSupabaseEnv()) {
    return 0;
  }

  // RACE-CONDITION FIX: claim jobs atomically by flipping `pending` → `running`
  // in a SINGLE UPDATE that also returns the rows. PostgREST executes this as
  // one statement, so a concurrent cron invocation's `eq("status","pending")`
  // will no longer match the already-claimed rows — preventing duplicate
  // execution (double emails/notifications) when the cron endpoint is hit
  // concurrently (overlapping hosted-cron ticks, double-fire, load balancers).
  const { data, error } = await serverClient()
    .from("scheduled_jobs")
    .update({
      status: "running",
      // Claim token identifies which cron invocation owns the job; also used
      // to detect stale "running" rows after a crashed run.
      locked_by: `cron:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    })
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .select("id, job_type, payload")
    .limit(50);

  if (error || !data || data.length === 0) {
    return 0;
  }

  let executed = 0;
  for (const job of data as DueJob[]) {
    try {
      await executeJob(job.job_type, job.payload ?? {});
      await serverClient()
        .from("scheduled_jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      executed += 1;
    } catch (err) {
      await serverClient()
        .from("scheduled_jobs")
        .update({ status: "failed" })
        .eq("id", job.id);
      // Log only the error message — never the full error object, whose
      // `.details` can embed row data (personal data).
      console.error(
        `[scheduler] job ${job.id} failed:`,
        err instanceof Error ? err.message : "unknown error",
      );
    }
  }
  return executed;
}

async function executeJob(jobType: JobType, payload: Record<string, unknown>): Promise<void> {
  switch (jobType) {
    case "trial_expiry": {
      const license = await getLicenseState();
      if (license && license.tier === "TRIAL") {
        const days = daysRemaining(license);
        const email = String(payload.email ?? "");
        if (days <= 3) {
          await createNotification({
            kind: "alert",
            title: "Trial expiring soon",
            description: `${days} day${days === 1 ? "" : "s"} left in your free trial. Upgrade to Pro to keep full access.`,
          });
          if (email) {
            await sendEmail({
              to: email,
              subject: "Your Fluxentiq trial is ending",
              text: `Your 15-day free trial has ${days} day${days === 1 ? "" : "s"} remaining. Upgrade to Pro to unlock unlimited records, custom AI providers and white-labeling.`,
            });
          }
        }
      }
      return;
    }
    case "payroll_reminder": {
      await createNotification({
        kind: "info",
        title: "Payroll reminder",
        description: String(payload.message ?? "A payroll run is due."),
      });
      return;
    }
    case "report": {
      await createNotification({
        kind: "info",
        title: "Scheduled report ready",
        description: String(payload.message ?? "Your scheduled report is available."),
      });
      return;
    }
  }
}
