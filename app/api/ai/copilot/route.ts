import { z } from "zod";
import { proxyToBridge, bridgeUrl, bridgeSecret } from "@/lib/ai-proxy";
import { checkRateLimit, limitForTier, orgScopedKey } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth";
import { getLicenseState } from "@/lib/license";
import {
  COPILOT_TOOL_NAMES,
  toolSpecsForBridge,
} from "@/lib/ai-providers";
import {
  executeCopilotTool,
  findCopilotTool,
  validateToolArguments,
} from "@/lib/copilot/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Copilot chat endpoint — agentic function-calling orchestrator.
 *
 * Request shapes:
 *   { messages, context }                    → classic streaming proxy
 *   { messages, context, tools: ["..."] }    → agentic loop:
 *       1. the Python bridge plans (LLM) and returns tool_calls in `done`
 *       2. READ tools execute immediately against the RBAC-guarded CRUD
 *          routes (session cookie forwarded — the agent inherits the
 *          caller's role and data scope)
 *       3. WRITE tools stream a `tool_call` event with
 *          `confirmationRequired: true` and stop; the client renders an
 *          inline approval card
 *       4. on approval the client resends with `confirmToolCall` and the
 *          loop continues until the planner produces a final answer
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
  tools: z.array(z.string().min(1).max(80)).max(12).optional(),
  confirmToolCall: z
    .object({
      name: z.string().min(1).max(80),
      arguments: z.record(z.string(), z.unknown()),
    })
    .optional(),
});

function invalid(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message, code: "INVALID_REQUEST" }, { status });
}

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

interface BridgeEvent {
  type: string;
  content?: string;
  result?: { text?: string; actions?: unknown[]; tool_calls?: Array<{ tool: string; arguments: Record<string, unknown> }> };
  message?: string;
}

/**
 * Calls the bridge copilot endpoint in planner mode (execute_tools=false) and
 * parses its SSE stream. Returns the raw events (replayed for final answers)
 * and the parsed `done` result.
 */
async function planWithBridge(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  toolNames: string[],
  organizationId: string | null,
): Promise<{ events: BridgeEvent[]; done: BridgeEvent["result"] | null }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = bridgeSecret();
  if (secret) headers["X-Bridge-Secret"] = secret;
  if (organizationId) headers["X-Organization-Id"] = organizationId;

  let upstream: Response;
  try {
    upstream = await fetch(`${bridgeUrl()}/api/ai/copilot`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        context: { organization_id: organizationId },
        tools: toolSpecsForBridge(toolNames),
        execute_tools: false,
      }),
    });
  } catch {
    throw new Error(`AI bridge unreachable at ${bridgeUrl()}. Is the Python server running?`);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(`AI bridge returned ${upstream.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const events: BridgeEvent[] = [];
  let buffer = "";
  let done: BridgeEvent["result"] | null = null;

  for (;;) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data) as BridgeEvent;
          events.push(event);
          if (event.type === "done") done = event.result ?? null;
        } catch {
          // Ignore malformed chunks — keep the stream alive.
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  return { events, done };
}

export async function POST(request: Request): Promise<Response> {
  // Validate on a clone so the original body stays consumable by the proxy.
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

  const agentic = parsed.data.tools !== undefined && parsed.data.tools.length > 0;

  // ── Classic mode: validated streaming proxy ────────────────────────────
  if (!agentic && !parsed.data.confirmToolCall) {
    try {
      return await proxyToBridge(request, "/api/ai/copilot");
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Unable to reach the AI bridge.",
          code: "BRIDGE_UNREACHABLE",
        },
        { status: 502 },
      );
    }
  }

  // ── Agentic mode ───────────────────────────────────────────────────────
  const toolNames = (parsed.data.tools ?? [])
    .map((name) => name.trim())
    .filter((name) => COPILOT_TOOL_NAMES.includes(name));
  const unknownTools = (parsed.data.tools ?? []).filter(
    (name) => !COPILOT_TOOL_NAMES.includes(name.trim()),
  );
  if (unknownTools.length > 0) {
    return invalid(`Unknown tools: ${unknownTools.join(", ")}.`);
  }

  // Rate limit (same tier policy as the classic proxy).
  let organizationId: string | null = null;
  try {
    organizationId = (await getCurrentUser()).organizationId ?? null;
  } catch {
    organizationId = null;
  }
  let tier: string | null = null;
  try {
    tier = (await getLicenseState())?.tier ?? null;
  } catch {
    tier = null;
  }
  const rate = checkRateLimit(
    orgScopedKey(request, organizationId),
    limitForTier(tier as never),
  );
  if (!rate.allowed) {
    return Response.json(
      { ok: false, error: "Rate limit exceeded. Try again shortly.", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  const conversation = parsed.data.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const origin = new URL(request.url).origin;
  const cookie = request.headers.get("cookie") ?? "";
  const toolContext = { origin, cookie };

  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;

  const emit = (event: Record<string, unknown>) => {
    try {
      streamController.enqueue(encoder.encode(sse(event)));
    } catch {
      // Stream already closed (client disconnected) — stop writing.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });

  const pump = async () => {
    try {
      // 1) Confirmed tool call (inline approval card → resend).
      if (parsed.data.confirmToolCall) {
        const definition = findCopilotTool(parsed.data.confirmToolCall.name);
        if (!definition) {
          emit({
            type: "tool_result",
            result: { tool: parsed.data.confirmToolCall.name, ok: false, message: `Unknown tool: ${parsed.data.confirmToolCall.name}` },
          });
          emit({ type: "error", message: `Unknown tool: ${parsed.data.confirmToolCall.name}` });
          emit({ type: "done", result: { text: "", actions: [] } });
          return;
        }
        if (definition.spec.kind !== "write") {
          emit({ type: "error", message: "Only write tools require confirmation." });
          return;
        }
        const validated = validateToolArguments(definition, parsed.data.confirmToolCall.arguments);
        if (!validated.ok) {
          emit({
            type: "tool_result",
            result: { tool: definition.spec.name, ok: false, message: validated.error },
          });
          emit({ type: "done", result: { text: "", actions: [] } });
          return;
        }
        emit({
          type: "tool_call",
          call: {
            name: definition.spec.name,
            arguments: validated.args,
            confirmationRequired: false,
            status: "executing",
          },
        });
        const execution = await executeCopilotTool(definition, validated.args, toolContext);
        emit({ type: "tool_result", result: { tool: execution.tool, ok: execution.ok, message: execution.message, data: execution.data } });
        conversation.push(
          { role: "assistant", content: `Tool call: ${definition.spec.name}(${JSON.stringify(validated.args)})` },
          { role: "user", content: `Tool result: ${execution.ok ? "success" : "failure"} — ${execution.message}` },
        );
      }

      // 2) Plan → execute loop (read tools execute; write tools need approval).
      const MAX_TOOL_ROUNDS = 3;
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const planned = await planWithBridge(conversation, toolNames, organizationId);
        const toolCalls = planned.done?.tool_calls ?? [];
        if (toolCalls.length === 0) {
          // Final answer — replay the planner's stream to the client.
          for (const event of planned.events) {
            if (event.type === "delta" && typeof event.content === "string") {
              emit({ type: "delta", content: event.content });
            } else if (event.type === "done") {
              emit({ type: "done", result: event.result ?? { text: "", actions: [] } });
            } else if (event.type === "error" && typeof event.message === "string") {
              emit({ type: "error", message: event.message });
            }
          }
          return;
        }

        const call = toolCalls[0];
        const definition = findCopilotTool(call.tool);
        if (!definition) {
          emit({
            type: "tool_result",
            result: { tool: call.tool, ok: false, message: `Unknown tool: ${call.tool}` },
          });
          conversation.push({ role: "user", content: `Tool result: failure — unknown tool ${call.tool}.` });
          continue;
        }

        const validated = validateToolArguments(definition, call.arguments);
        if (!validated.ok) {
          emit({
            type: "tool_result",
            result: { tool: call.tool, ok: false, message: validated.error },
          });
          conversation.push({ role: "user", content: `Tool result: failure — invalid arguments: ${validated.error}.` });
          continue;
        }

        if (definition.spec.kind === "write") {
          // Needs inline approval — hand control back to the client.
          emit({
            type: "tool_call",
            call: {
              name: definition.spec.name,
              arguments: validated.args,
              confirmationRequired: true,
              description: definition.spec.description,
            },
          });
          emit({ type: "done", result: { text: "", actions: [], requiresConfirmation: true } });
          return;
        }

        emit({
          type: "tool_call",
          call: { name: definition.spec.name, arguments: validated.args, confirmationRequired: false, status: "executing" },
        });
        const execution = await executeCopilotTool(definition, validated.args, toolContext);
        emit({ type: "tool_result", result: { tool: execution.tool, ok: execution.ok, message: execution.message, data: execution.data } });
        conversation.push(
          { role: "assistant", content: `Tool call: ${definition.spec.name}(${JSON.stringify(validated.args)})` },
          { role: "user", content: `Tool result: ${execution.ok ? "success" : "failure"} — ${execution.message}` },
        );
      }

      // 3) Loop exhausted — force a final plain answer.
      const forced = await planWithBridge(conversation, [], organizationId);
      for (const event of forced.events) {
        if (event.type === "delta" && typeof event.content === "string") {
          emit({ type: "delta", content: event.content });
        } else if (event.type === "done") {
          emit({ type: "done", result: event.result ?? { text: "", actions: [] } });
        }
      }
    } catch (error) {
      emit({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to reach the AI bridge.",
      });
    } finally {
      try {
        streamController.close();
      } catch {
        // Already closed.
      }
    }
  };

  void pump();

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
