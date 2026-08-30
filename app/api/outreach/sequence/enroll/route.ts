import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enrollOutreachSchema } from "@/lib/validations/ai";
import { enrollCandidateInSequence } from "@/services/outreachSequenceService";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization"; // Assuming this exists or will be created

export const runtime = "nodejs";

/**
 * POST /api/outreach/sequence/enroll
 * Enrolls a candidate in a new automated outreach campaign.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parseResult = enrollOutreachSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.format() }, { status: 400 });
    }

    const { candidateId, jobId, subject, body: emailBody, suggestedFollowUpDays, tone, action, context } = parseResult.data;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // In a real application, get the organizationId from the user's session or context
    // For this example, we'll use a placeholder or assume a global context provider
    const organizationId = getOrganizationId(user);
    if (!organizationId) {
      return NextResponse.json({ error: "Organization context required" }, { status: 400 });
    }

    const campaign = await enrollCandidateInSequence(
      candidateId,
      jobId,
      subject,
      emailBody,
      suggestedFollowUpDays,
      tone,
      action,
      context,
    );

    return NextResponse.json({ success: true, campaignId: campaign.id }, { status: 200 });
  } catch (error) {
    console.error("Failed to enroll candidate in outreach sequence:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enroll candidate in outreach sequence" },
      { status: 500 }
    );
  }
}