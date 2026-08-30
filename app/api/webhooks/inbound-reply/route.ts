import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { outreachSequenceSchema } from "@/db/schema/outreachSequence";
import { cancelSequenceOnReply } from "@/services/outreachSequenceService";

// Schema for inbound email webhook payload (simplified for example)
const inboundReplySchema = z.object({
  from: z.string().email(),
  to: z.string().email(),
  subject: z.string(),
  messageId: z.string(),
  timestamp: z.string().datetime(),
});

export const runtime = "nodejs";

/**
 * POST /api/webhooks/inbound-reply
 * Handles inbound email replies to automatically halt outreach sequences.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify the webhook signature (implementation depends on your email provider)
    // For this example, we'll assume the signature is verified

    const body = await request.json();
    const parseResult = inboundReplySchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.format() }, { status: 400 });
    }

    const { from, to, subject, messageId, timestamp } = parseResult.data;

    // Find the candidate by email
    const candidate = await db.query.candidates.findFirst({
      where: eq(outreachSequenceSchema.outreachCampaigns.candidate.email, from),
    });

    if (!candidate) {
      // If we don't recognize the candidate, we can't halt any sequences
      return NextResponse.json({ success: true, message: "Candidate not found" }, { status: 200 });
    }

    // Find active campaigns for this candidate
    const activeCampaigns = await db.query.outreachCampaigns.findMany({
      where: and(
        eq(outreachSequenceSchema.outreachCampaigns.candidateId, candidate.id),
        eq(outreachSequenceSchema.outreachCampaigns.status, "active"),
      ),
    });

    // Cancel all active campaigns for this candidate
    for (const campaign of activeCampaigns) {
      await cancelSequenceOnReply(campaign.id);
    }

    // Log the inbound reply (optional)
    // In a real application, you might want to store this in a separate table
    console.log(`Received reply from ${from} to ${to} with subject: ${subject}`);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to process inbound reply webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process inbound reply" },
      { status: 500 }
    );
  }
}