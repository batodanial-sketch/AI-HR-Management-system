import { z } from "zod";
import { proxyToBridge, bridgeUrl, bridgeSecret, BRIDGE_LLM_TIMEOUT_MS } from "@/lib/ai-proxy";
import { checkRateLimit, limitForTier, orgScopedKey } from "@/lib/rate-limit";
import { getRbacContext, rbacErrorResponse } from "@/lib/rbac";
import { getLicenseState } from "@/lib/license";
import {
  COPILOT_TOOL_NAMES,
  toolSpecsForBridge,
} from "@/lib/ai-providers";
import {
  COPILOT_TOOL_MODULES,
  executeCopilotTool,
  findCopilotTool,
  validateToolArguments,
} from "@/lib/copilot/tools";
import { recordAuditLog } from "@/lib/audit";
import {
  checkAiBudget,
  recordAiTelemetry,
  type AiBudgetDecision,
} from "@/lib/ai/telemetry";
import { evaluatePilotAccess, maxToolRounds } from "@/lib/pilot/controls";
import { metrics, withHttpMetrics } from "@/lib/observability/metrics";
import { captureException } from "@/lib/observability/errors";
import {
  claimProposal,
  createProposal,
  denyProposal,
  finishProposal,
  ProposalError,
  type ProposalActor,
} from "@/lib/copilot/proposals";
import { routeConversation, type AgentId } from "@/lib/agents/router";
import { AGENT_POLICIES, resolveAgentTools } from "@/lib/agents/policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Copilot chat endpoint — agentic function-calling orchestrator.
 *
 * Request shapes:
 *   { messages, context }                    → classic streaming proxy
 *   { messages, context, tools: ["..."] }    → agentic loop
 *   { ..., agent: "intelligence" | "recruitment" | "general" | "auto" }
 *                                            → agentic loop narrowed to the
 *                                              agent policy (+ planner hint);
 *                                              "auto" classifies intent
 *                                              deterministically (lib/agents)
 *       1. the Python bridge plans (LLM) and returns tool_calls in `done`
 *       2. READ tools execute immediately against the RBAC-guarded CRUD
 *          routes (session cookie forwarded — the agent inherits the
 *          caller's role and data scope)
 *       3. WRITE tools become a server-side PROPOSAL (arguments frozen and
 *          hashed in `copilot_proposals`); the client receives
 *          `confirmationRequired: true` + `proposalId` and renders an
 *          approval card
 *       4. on approval the client resends ONLY `{ approveProposal: id }`;
 *          the server re-checks authorization against the CURRENT canonical
 *          membership, claims the proposal (exactly one winner), executes
 *          the frozen arguments under the caller's session, persists a
 *          receipt and audits — then the loop continues
 *
 * The model never executes writes; the client never supplies arguments for
 * an approved action. `confirmToolCall` (legacy: client-supplied arguments)
 * is rejected.
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
  /** Named agent (intelligence | recruitment | general) or auto-routing. Narrows tools to the agent policy. */
  agent: z.enum(["intelligence", "recruitment", "general", "auto"]).optional(),
  /** Legacy client-supplied confirmation — rejected (see proposal flow). */
  confirmToolCall: z.unknown().optional(),
  approveProposal: z.string().uuid().optional(),
  denyProposal: z.string().uuid().optional(),
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

interface BridgeUsage {
  promptTokens: number;
  completionTokens: number;
  model: string | null;
  costUsd: number | null;
  latencyMs: number;
}

/**
 * Calls the bridge copilot endpoint in planner mode (execute_tools=false) and
 * parses its SSE stream. Returns the raw events (replayed for final answers),
 * the parsed `done` result, and the token/latency metadata echoed by the
 * bridge (X-Prompt-Tokens / X-Completion-Tokens / X-Model / X-Cost-Usd).
 */
async function planWithBridge(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  toolNames: string[],
  organizationId: string | null,
  agentContext?: { agent: AgentId; hint: string } | null,
): Promise<{ events: BridgeEvent[]; done: BridgeEvent["result"] | null; usage: BridgeUsage }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = bridgeSecret();
  if (secret) headers["X-Bridge-Secret"] = secret;
  if (organizationId) headers["X-Organization-Id"] = organizationId;

  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(`${bridgeUrl()}/api/ai/copilot`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        context: {
          organization_id: organizationId,
          ...(agentContext ? { agent: agentContext.agent, agent_hint: agentContext.hint } : {}),
        },
        tools: toolSpecsForBridge(toolNames),
        execute_tools: false,
      }),
      // Single planner round: bounded by the bridge's 90s provider cap.
      signal: AbortSignal.timeout(BRIDGE_LLM_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`AI bridge unreachable at ${bridgeUrl()}. Is the Python server running?`);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(`AI bridge returned ${upstream.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`);
  }

  const usage: BridgeUsage = {
    promptTokens: Number(upstream.headers.get("X-Prompt-Tokens")) || 0,
    completionTokens: Number(upstream.headers.get("X-Completion-Tokens")) || 0,
    model: upstream.headers.get("X-Model"),
    costUsd: Number(upstream.headers.get("X-Cost-Usd")) || null,
    latencyMs: Date.now() - startedAt,
  };

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

  return { events, done, usage };
}

export async function POST(request: Request): Promise<Response> {
  return withHttpMetrics(request, () => handleCopilot(request));
}

async function handleCopilot(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
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

  if (parsed.data.confirmToolCall !== undefined) {
    return invalid("confirmToolCall is no longer accepted — approve the server-side proposal instead.", 400);
  }

  const agentic = parsed.data.tools !== undefined && parsed.data.tools.length > 0;
  const approving = Boolean(parsed.data.approveProposal || parsed.data.denyProposal);

  // ── Classic mode: validated streaming proxy ────────────────────────────
  if (!agentic && !approving) {
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
  let toolNames = (parsed.data.tools ?? [])
    .map((name) => name.trim())
    .filter((name) => COPILOT_TOOL_NAMES.includes(name));
  const unknownTools = (parsed.data.tools ?? []).filter(
    (name) => !COPILOT_TOOL_NAMES.includes(name.trim()),
  );
  if (unknownTools.length > 0) {
    return invalid(`Unknown tools: ${unknownTools.join(", ")}.`);
  }

  // ── Agent routing (additive; default behavior unchanged when unset) ─────
  // An explicit agent (or "auto" classification) NARROWS the tool surface to
  // the agent policy and forwards the planner hint via the bridge context
  // block. Enforcement still lives here + RBAC + proposals, never in the hint.
  const requestedAgent = parsed.data.agent ?? null;
  let activeAgent: AgentId | null = null;
  let routeReasons: string[] = [];
  let routeConfidence = 0;
  if (requestedAgent) {
    if (requestedAgent === "auto") {
      const decision = routeConversation(
        parsed.data.messages.map((message) => ({ role: message.role, content: message.content })),
      );
      activeAgent = decision.agent;
      routeReasons = decision.reasons;
      routeConfidence = decision.confidence;
    } else {
      activeAgent = requestedAgent;
    }
    toolNames = resolveAgentTools(activeAgent, toolNames);
    if ((parsed.data.tools ?? []).length > 0 && toolNames.length === 0) {
      return invalid(`None of the requested tools are available to the '${activeAgent}' agent.`);
    }
  }
  const agentContext = activeAgent ? { agent: activeAgent, hint: AGENT_POLICIES[activeAgent].systemHint } : null;

  // Caller RBAC — resolved ONCE from the canonical membership resolver and
  // fixed for the whole agentic run. The tenant and actor used for tool
  // execution, audit attribution, budget and telemetry all derive from it;
  // `context.organization_id` in the request body is ignored. A caller with
  // no valid canonical membership is denied before any planning happens.
  let rbac;
  try {
    rbac = await getRbacContext();
  } catch (error) {
    const denied = rbacErrorResponse(error);
    if (denied) return denied;
    throw error;
  }
  const organizationId: string | null = rbac.demoMode ? null : rbac.organizationId;
  const actorId: string = rbac.user.id;
  const proposalActor: ProposalActor = { actorId, organizationId: rbac.organizationId, role: rbac.role, demoMode: rbac.demoMode };

  // Pilot controls: kill switch, tenant allowlist, per-request ceiling.
  const estimatedTokens =
    parsed.data.messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0) + 500;
  const pilot = evaluatePilotAccess({ organizationId, estimatedTokens });
  if (!pilot.allowed) {
    metrics.increment("ai_requests_total", { feature: "copilot", outcome: pilot.code === "AI_DISABLED" ? "denied" : "denied" });
    return Response.json({ ok: false, error: pilot.message, code: pilot.code }, { status: pilot.status, headers: { "Cache-Control": "no-store" } });
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
    metrics.increment("rate_limit_events_total", { scope: "org" });
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

  /** Governance: every agentic tool run lands in the audit trail. */
  const auditToolRun = (name: string, args: Record<string, unknown>, ok: boolean, message: string) => {
    metrics.increment("copilot_tool_calls_total", { tool: name, outcome: ok ? "ok" : "error" });
    return recordAuditLog({
      actorId,
      actorType: "COPILOT_AGENT",
      action: `copilot.tool.${name}`,
      targetModule: COPILOT_TOOL_MODULES[name] ?? "copilot",
      changes: { arguments: args, ok, message, requestId, agent: activeAgent },
      organizationId,
    });
  };

  /** Observability: per-plan latency + token metering (fire-and-forget). */
  const meterPlan = (usage: BridgeUsage) => {
    metrics.increment("ai_requests_total", { feature: "copilot", outcome: "ok" });
    metrics.observe("ai_request_duration_ms", usage.latencyMs, { feature: "copilot" });
    if (!organizationId) return;
    void recordAiTelemetry({
      feature: "copilot",
      organizationId,
      model: usage.model,
      provider: "bridge",
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      latencyMs: usage.latencyMs,
      costUsd: usage.costUsd,
    });
  };

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
      // -1) Agent transparency — clients may surface which agent is active.
      if (activeAgent) {
        emit({ type: "route", agent: activeAgent, confidence: routeConfidence, reasons: routeReasons });
      }
      // 0) Budget governance — block before any spend when the org's monthly
      // cap is exhausted; attach a fallback hint when it approaches.
      if (organizationId) {
        const estimatedTokens =
          conversation.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0) +
          500; // planner overhead allowance
        const budget: AiBudgetDecision = await checkAiBudget(organizationId, estimatedTokens);
        if (!budget.allowed) {
          emit({
            type: "budget",
            budget: {
              allowed: false,
              threshold: budget.threshold,
              fallbackModel: budget.fallbackModel,
              fallbackProvider: budget.fallbackProvider,
            },
          });
          emit({
            type: "error",
            message: `AI budget exceeded for this month. Requests are paused until the cap resets — ask an admin to raise the limit or route to the fallback model (${budget.fallbackModel ?? "configure one in Settings"}).`,
            code: "AI_BUDGET_EXCEEDED",
          });
          emit({ type: "done", result: { text: "", actions: [] } });
          if (organizationId) {
            void recordAiTelemetry({
              feature: "copilot",
              organizationId,
              status: "budget_blocked",
              latencyMs: 0,
            });
          }
          return;
        }
        if (budget.threshold === "warning") {
          emit({
            type: "budget",
            budget: {
              allowed: true,
              threshold: "warning",
              remainingTokens: budget.remainingTokens,
              remainingCostUsd: budget.remainingCostUsd,
              fallbackModel: budget.fallbackModel,
              fallbackProvider: budget.fallbackProvider,
            },
          });
        }
      }

      // 1) Human decision on a server-side proposal.
      if (parsed.data.denyProposal) {
        try {
          await denyProposal(proposalActor, parsed.data.denyProposal);
          emit({ type: "proposal", proposalId: parsed.data.denyProposal, status: "denied" });
          emit({ type: "done", result: { text: "Action cancelled.", actions: [] } });
        } catch (error) {
          const code = error instanceof ProposalError ? error.code : "UNAVAILABLE";
          emit({ type: "error", message: error instanceof Error ? error.message : "Unable to deny proposal.", code });
          emit({ type: "done", result: { text: "", actions: [] } });
        }
        return;
      }
      if (parsed.data.approveProposal) {
        let proposal;
        try {
          // Authorization is re-checked HERE against the current canonical
          // membership; exactly one claimant can win.
          proposal = await claimProposal(proposalActor, parsed.data.approveProposal);
        } catch (error) {
          const code = error instanceof ProposalError ? error.code : "UNAVAILABLE";
          emit({ type: "proposal", proposalId: parsed.data.approveProposal, status: code === "ALREADY_DECIDED" ? "already_decided" : "rejected", code });
          emit({ type: "error", message: error instanceof Error ? error.message : "Unable to approve proposal.", code });
          emit({ type: "done", result: { text: "", actions: [] } });
          return;
        }
        const definition = findCopilotTool(proposal.toolName);
        if (!definition || definition.spec.kind !== "write") {
          await finishProposal(proposalActor, proposal, false, { error: "unknown_tool" });
          emit({ type: "error", message: `Unknown tool: ${proposal.toolName}`, code: "UNKNOWN_TOOL" });
          emit({ type: "done", result: { text: "", actions: [] } });
          return;
        }
        // Arguments come from the frozen proposal row — never from the client.
        const validated = validateToolArguments(definition, proposal.arguments);
        if (!validated.ok) {
          await finishProposal(proposalActor, proposal, false, { error: validated.error });
          emit({ type: "tool_result", result: { tool: definition.spec.name, ok: false, message: validated.error } });
          emit({ type: "done", result: { text: "", actions: [] } });
          return;
        }
        emit({
          type: "tool_call",
          call: { name: definition.spec.name, arguments: validated.args, confirmationRequired: false, status: "executing", proposalId: proposal.id },
        });
        const execution = await executeCopilotTool(definition, validated.args, toolContext);
        const finished = await finishProposal(proposalActor, proposal, execution.ok, { message: execution.message, data: execution.data ?? null });
        emit({ type: "tool_result", result: { tool: execution.tool, ok: execution.ok, message: execution.message, data: execution.data } });
        emit({ type: "proposal", proposalId: proposal.id, status: finished.status, receipt: finished.receipt });
        await auditToolRun(definition.spec.name, validated.args, execution.ok, execution.message);
        conversation.push(
          { role: "assistant", content: `Tool call: ${definition.spec.name}(${JSON.stringify(validated.args)})` },
          { role: "user", content: `Tool result: ${execution.ok ? "success" : "failure"} — ${execution.message}` },
        );
      }

      // 2) Plan → execute loop (read tools execute; write tools need approval).
      const MAX_TOOL_ROUNDS = maxToolRounds();
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const planned = await planWithBridge(conversation, toolNames, organizationId, agentContext);
        meterPlan(planned.usage);
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
          // Consequential action → server-side proposal; hand control back to
          // the human. Arguments are frozen now; the client only gets an id.
          let proposalId: string;
          try {
            proposalId = (await createProposal(proposalActor, definition.spec.name, validated.args, requestId)).id;
          } catch (error) {
            emit({ type: "error", message: error instanceof Error ? error.message : "Unable to create proposal.", code: "PROPOSAL_UNAVAILABLE" });
            emit({ type: "done", result: { text: "", actions: [] } });
            return;
          }
          emit({
            type: "tool_call",
            call: {
              name: definition.spec.name,
              arguments: validated.args,
              confirmationRequired: true,
              description: definition.spec.description,
              proposalId,
            },
          });
          emit({ type: "done", result: { text: "", actions: [], requiresConfirmation: true, proposalId } });
          return;
        }

        emit({
          type: "tool_call",
          call: { name: definition.spec.name, arguments: validated.args, confirmationRequired: false, status: "executing" },
        });
        const execution = await executeCopilotTool(definition, validated.args, toolContext);
        emit({ type: "tool_result", result: { tool: execution.tool, ok: execution.ok, message: execution.message, data: execution.data } });
        await auditToolRun(definition.spec.name, validated.args, execution.ok, execution.message);
        conversation.push(
          { role: "assistant", content: `Tool call: ${definition.spec.name}(${JSON.stringify(validated.args)})` },
          { role: "user", content: `Tool result: ${execution.ok ? "success" : "failure"} — ${execution.message}` },
        );
      }

      // 3) Loop exhausted — force a final plain answer.
      const forced = await planWithBridge(conversation, [], organizationId, agentContext);
      meterPlan(forced.usage);
      for (const event of forced.events) {
        if (event.type === "delta" && typeof event.content === "string") {
          emit({ type: "delta", content: event.content });
        } else if (event.type === "done") {
          emit({ type: "done", result: event.result ?? { text: "", actions: [] } });
        }
      }
    } catch (error) {
      metrics.increment("ai_failures_total", { feature: "copilot", reason: /unreachable/i.test(String(error)) ? "unavailable" : /429/.test(String(error)) ? "rate_limited" : /401|403/.test(String(error)) ? "unauthorized" : /5\d\d/.test(String(error)) ? "server_error" : "unknown" });
      void captureException(error, { requestId, route: "/api/ai/copilot", organizationId, userId: actorId });
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
      "X-Request-Id": requestId,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
