import "server-only";
import { processOutreachQueue } from "@/services/outreachSequenceService";

/**
 * Background worker to process outreach follow-up queue
 * This should be triggered by a cron job or queue processor
 */
export async function outreachFollowUpWorker() {
  try {
    // Check if we're in dry-run mode
    const isDryRun = process.env.PROCESS_OUTREACH_DRY_RUN === "true";

    if (isDryRun) {
      console.log("[Dry Run] Processing outreach queue without sending emails");
    }

    // Process the outreach queue
    await processOutreachQueue(isDryRun);

    if (isDryRun) {
      console.log("[Dry Run] Outreach queue processing completed");
    }
  } catch (error) {
    console.error("Failed to process outreach queue:", error);
    // In a real application, you might want to log this to an error tracking service
  }
}