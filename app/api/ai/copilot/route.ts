import { z } from "zod";
import { proxyToBridge } from "@/lib/ai-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Copilot chat endpoint.
 *
 * Pre-validates the chat payload (messages + context) against a strict Zod
 * schema — including the streaming-required invariant that the final message
 * comes from the user — then hands off to `proxyToBridge`, which applies
 * org-scoped rate limiting, AI usage metering, bridge auth (BRIDGE_SECRET_KEY)
 * and streams the upstream SSE response back to the client. Any upstream
 * failure returns a clean JSON `{ error }` envelope that the UI surfaces as a
 * toast instead of a frozen stream.
 */

const copilotMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(32_000),
});

const copilotRequestSchema = z.object({
  messages: z.array(copilotMessageSchema).min(1).max(40),
  context: z
    .object({ organization_id: z.string().uuid().nullable().optional() })
    .optional(),
});

function invalid(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message, code: "INVALID_REQUEST" }, { status });
}

export async function POST(request: Request): Promise<Response> {
  // Validate on a clone so the original request body remains consumable by
  // proxyToBridge.
  let payload: unknown;
  try {
    payload = await request.clone().json();
  } catch {
    return invalid("Request body must be valid JSON.");
  }

  const parsed = copilotRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return invalid(parsed.error.issues.map((issue) => issue.message).join(" "));
  }

  const last = parsed.data.messages[parsed.data.messages.length - 1];
  if (!last || last.role !== "user") {
    return invalid("The final message must come from the user.");
  }

  try {
    return await proxyToBridge(request, "/api/ai/copilot");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach the AI bridge.";
    return Response.json(
      { ok: false, error: message, code: "BRIDGE_UNREACHABLE" },
      { status: 502 },
    );
  }
}
