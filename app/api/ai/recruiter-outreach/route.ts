import { z } from "zod";
import { recruiterOutreachSchema } from "@/lib/validations/ai";
import { bridgeUrl, bridgeSecret } from "@/lib/ai-proxy";
import {
  generateOutreachEmail,
  formatRecruiterOutreachResponse,
  handleRecruiterOutreachError,
} from "@/services/ai/recruiterAgentService";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parseResult = recruiterOutreachSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: parseResult.error.format() }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { candidateId, jobId, context, tone, action, subject, template } = parseResult.data;
    const outreachData = await generateOutreachEmail(candidateId, jobId, context, tone, action, subject, template);
    const response = formatRecruiterOutreachResponse(outreachData);

    return Response.json(response);
  } catch (e) {
    const errorResponse = handleRecruiterOutreachError(e);
    return Response.json(errorResponse, {
      status: errorResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}