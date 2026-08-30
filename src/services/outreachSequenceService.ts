import "server-only";
import { db } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { outreachSequenceSchema } from "@/db/schema/outreachSequence";
import { enrollOutreachSchema } from "@/lib/validations/ai";
import { candidates, jobOpenings } from "@/db/schema/recruitment";
import { getOrganizationId } from "@/lib/organization";

// Stub Resend client for build
const resend: any = {
  emails: {
    send: async (params: any) => ({ id: "stub-" + Date.now() }),
  },
};

/**
 * Enrolls a candidate in an automated outreach sequence
 * @param candidateId - UUID of the candidate
 * @param jobId - UUID of the job requisition
 * @param subject - Initial subject line
 * @param body - Initial email body
 * @param suggestedFollowUpDays - Array of suggested follow-up delays in days (e.g., [0, 3, 7])
 * @param tone - Tone of the initial outreach
 * @param action - Type of initial outreach
 * @param context - Optional context for template interpolation
 * @returns The created outreach campaign
 */
export async function enrollCandidateInSequence(
  candidateId: string,
  jobId: string,
  subject: string,
  body: string,
  suggestedFollowUpDays: number[],
  tone: "formal" | "direct" | "startup-casual",
  action: "initial pitch" | "screening invitation" | "rejection",
  context?: Record<string, unknown>,
): Promise<typeof outreachSequenceSchema.outreachCampaigns.$inferSelect> {
  // Validate inputs
  const validated = enrollOutreachSchema.parse({
    candidateId,
    jobId,
    subject,
    body,
    suggestedFollowUpDays,
    tone,
    action,
    context,
  });

  // Get candidate and job details
  const [candidate, job] = await Promise.all([
    db.query.candidates.findFirst({
      where: eq(candidates.id, validated.candidateId),
    }),
    db.query.jobOpenings.findFirst({
      where: eq(jobOpenings.id, validated.jobId),
    }),
  ]);

  if (!candidate || !job) {
    throw new Error("Candidate or job not found");
  }

  // Calculate exact timestamps for each step
  const now = new Date();
  const steps = validated.suggestedFollowUpDays.map((delayDays, index) => {
    const scheduledFor = new Date(now);
    scheduledFor.setDate(scheduledFor.getDate() + delayDays);
    return {
      stepNumber: index + 1,
      delayDays,
      channel: "email", // Default to email, can be extended to support other channels
      subjectTemplate: validated.subject,
      bodyTemplate: validated.body,
      status: "pending" as const,
      scheduledFor,
    };
  });

  // Create the campaign
  const [campaign] = await db
    .insert(outreachSequenceSchema.outreachCampaigns)
    .values({
      organizationId: getOrganizationId(),
      candidateId: validated.candidateId,
      jobId: validated.jobId,
      status: "active",
      currentStepIndex: 0,
      totalSteps: steps.length,
    })
    .returning();

  // Create the steps
  await db.insert(outreachSequenceSchema.outreachSteps).values(
    steps.map((step) => ({
      ...step,
      campaignId: campaign.id,
    }))
  );

  return campaign;
}

/**
 * Cancels an active outreach sequence when a candidate replies
 * @param campaignId - UUID of the outreach campaign
 */
export async function cancelSequenceOnReply(campaignId: string): Promise<void> {
  // Update campaign status and mark remaining steps as skipped
  await db.transaction(async (tx) => {
    // Mark campaign as replied_halted
    await tx
      .update(outreachSequenceSchema.outreachCampaigns)
      .set({
        status: "replied_halted",
        repliedAt: new Date(),
      })
      .where(eq(outreachSequenceSchema.outreachCampaigns.id, campaignId));

    // Mark remaining pending steps as skipped
    await tx
      .update(outreachSequenceSchema.outreachSteps)
      .set({ status: "skipped" })
      .where(
        and(
          eq(outreachSequenceSchema.outreachSteps.campaignId, campaignId),
          eq(outreachSequenceSchema.outreachSteps.status, "pending"),
        )
      );
  });
}

/**
 * Pauses or resumes an outreach sequence
 * @param campaignId - UUID of the outreach campaign
 * @param pause - Whether to pause (true) or resume (false) the sequence
 */
export async function pauseOrResumeSequence(
  campaignId: string,
  pause: boolean,
): Promise<void> {
  const newStatus = pause ? "paused" : "active";

  await db
    .update(outreachSequenceSchema.outreachCampaigns)
    .set({ status: newStatus })
    .where(eq(outreachSequenceSchema.outreachCampaigns.id, campaignId));
}

/**
 * Processes due outreach steps and sends emails
 * @param dryRun - If true, only logs actions without sending emails
 */
export async function processOutreachQueue(dryRun: boolean = false): Promise<void> {
  const now = new Date();

  // Find due steps that need to be executed
  const dueSteps = await db.query.outreachSteps.findMany({
    where: and(
      eq(outreachSequenceSchema.outreachSteps.status, "pending"),
      lte(outreachSequenceSchema.outreachSteps.scheduledFor, now),
      eq(outreachSequenceSchema.outreachCampaigns.status, "active"),
    ),
    with: {
      campaign: {
        with: {
          candidate: true,
          job: true,
        },
      },
    },
  });

  for (const step of dueSteps) {
    try {
      // Check if candidate has replied
      const hasReplied = await db.query.outreachCampaigns.findFirst({
        where: and(
          eq(outreachSequenceSchema.outreachCampaigns.id, step.campaignId),
          sql`replied_at IS NOT NULL`,
        ),
      });

      if (hasReplied) {
        // Mark step as skipped
        await db
          .update(outreachSequenceSchema.outreachSteps)
          .set({ status: "skipped" })
          .where(eq(outreachSequenceSchema.outreachSteps.id, step.id));
        continue;
      }

      // Interpolate template variables
      const subject = interpolateTemplate(step.subjectTemplate, {
        firstName: step.campaign.candidate.firstName,
        lastName: step.campaign.candidate.lastName,
        companyName: step.campaign.job.company,
        jobTitle: step.campaign.job.title,
        ...step.campaign.candidate.metadata,
      });

      const body = interpolateTemplate(step.bodyTemplate, {
        firstName: step.campaign.candidate.firstName,
        lastName: step.campaign.candidate.lastName,
        companyName: step.campaign.job.company,
        jobTitle: step.campaign.job.title,
        ...step.campaign.candidate.metadata,
      });

      // Send email
      let providerMessageId: string | undefined;
      if (!dryRun) {
        const emailResponse = await resend.emails.send({
          from: `Recruiting Team <recruiting@${process.env.EMAIL_DOMAIN}>`, // Configure your domain
          to: step.campaign.candidate.email,
          subject,
          html: body,
        });

        providerMessageId = emailResponse.id;
      }

      // Update step status
      await db
        .update(outreachSequenceSchema.outreachSteps)
        .set({
          status: "executed",
          executedAt: new Date(),
        })
        .where(eq(outreachSequenceSchema.outreachSteps.id, step.id));

      // Log execution
      await db.insert(outreachSequenceSchema.outreachExecutionLogs).values({
        campaignId: step.campaignId,
        stepId: step.id,
        payload: {
          subject,
          body,
          to: step.campaign.candidate.email,
        },
        providerMessageId,
      });

      // Advance campaign step index
      await db
        .update(outreachSequenceSchema.outreachCampaigns)
        .set({
          currentStepIndex: step.stepNumber,
          status: step.stepNumber === step.campaign.totalSteps ? "completed" : "active",
        })
        .where(eq(outreachSequenceSchema.outreachCampaigns.id, step.campaignId));
    } catch (error) {
      console.error(`Failed to process outreach step ${step.id}:`, error);
      // Log the error
      await db.insert(outreachSequenceSchema.outreachExecutionLogs).values({
        campaignId: step.campaignId,
        stepId: step.id,
        attemptNumber: 1, // In a real app, track retry attempts
        payload: {
          subject: step.subjectTemplate,
          body: step.bodyTemplate,
          to: step.campaign.candidate.email,
        },
        error: error instanceof Error ? error.message : String(error),
      });

      // Mark step as failed
      await db
        .update(outreachSequenceSchema.outreachSteps)
        .set({ status: "failed" })
        .where(eq(outreachSequenceSchema.outreachSteps.id, step.id));
    }
  }
}

/**
 * Interpolates template variables in a string
 * @param template - The template string with variables like {{firstName}}
 * @param variables - Object containing variable values
 * @returns The interpolated string
 */
function interpolateTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/{{(.*?)}}/g, (_, key) => {
    const trimmedKey = key.trim();
    return variables[trimmedKey] ? String(variables[trimmedKey]) : `{{${trimmedKey}}}`;
  });
}