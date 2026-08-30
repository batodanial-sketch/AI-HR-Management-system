"use client";

import * as React from "react";
import {
  Bot,
  CircleAlert,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Wrench,
  Zap,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useLicense, useUser } from "@/components/providers";
import { streamAi } from "@/lib/ai-client";
import { COPILOT_TOOL_NAMES } from "@/lib/ai-providers";
import {
  ToolStepCard,
  type ToolStepState,
} from "@/components/copilot/tool-step";
import { useSupabaseRealtime } from "@/hooks/use-realtime";
import type { CopilotAction } from "@/lib/types";

/**
 * AI Copilot — agentic chat surface with active tool-calling.
 *
 * The conversation runs through `/api/ai/copilot` in agentic mode: the LLM
 * planner can call any registered tool (create_expense, approve_offboarding,
 * fetch_contractors, screen_candidate, …), each mapped 1:1 onto the
 * RBAC-guarded CRUD routes. Read tools execute immediately; write tools
 * render inline approval cards (Approve/Deny) before any state change.
 * Tool results render as rich cards with live status badges, and the
 * backend-state panel (provider, seats, tier) updates in real time via
 * Supabase Realtime.
 */

type ConnectionStatus = "idle" | "checking" | "connected" | "error";

interface BackendState {
  status: ConnectionStatus;
  provider: string | null;
  model: string | null;
  endpoint: string | null;
  message: string | null;
  checkedAt: string | null;
}

interface CapacityState {
  tier: string | null;
  limit: number | null;
  used: number;
  available: number | null;
  limited: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: CopilotAction[];
  executions: string[];
  createdAt: string;
  streaming?: boolean;
  aborted?: boolean;
}

interface CopilotDoneResult {
  text?: string;
  actions?: CopilotAction[];
  actionCards?: Array<{ title: string; kind: CopilotAction["kind"]; target: string }>;
  requiresConfirmation?: boolean;
}

const WELCOME: ChatMessage = {
  id: "copilot-welcome",
  role: "assistant",
  text: "Hi, I'm your Fluxentiq Copilot — now with live tool access. Ask me to check seat capacity, submit an expense, approve an offboarding, or screen a candidate. I'll stream the plan, ask you to approve any write before it happens, and show the result inline.",
  actions: [],
  executions: [],
  createdAt: new Date().toISOString(),
};

const SUGGESTIONS = [
  "How many seats are left on our license?",
  "What offboarding cases are in progress?",
  "Submit a $240 AWS expense for Priya Nair",
  "Screen candidate for Backend Engineer with a score of 86",
];

function normalizeResult(result: CopilotDoneResult): { text: string; actions: CopilotAction[] } {
  let actions: CopilotAction[] = [];
  if (result.actions && result.actions.length > 0) {
    actions = result.actions;
  } else if (result.actionCards && result.actionCards.length > 0) {
    actions = result.actionCards.map((card, index) => ({
      id: `action-${index + 1}`,
      title: card.title,
      kind: card.kind,
      target: card.target,
    }));
  }
  return { text: result.text ?? "", actions };
}

export default function CopilotPage() {
  const { toast } = useToast();
  const user = useUser();
  const license = useLicense();
  const [messages, setMessages] = React.useState<ChatMessage[]>([WELCOME]);
  const [steps, setSteps] = React.useState<ToolStepState[]>([]);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [backend, setBackend] = React.useState<BackendState>({
    status: "idle",
    provider: null,
    model: null,
    endpoint: null,
    message: null,
    checkedAt: null,
  });
  const [capacity, setCapacity] = React.useState<CapacityState>({
    tier: license?.tier ?? null,
    limit: license ? (license.tier === "TRIAL" ? 50 : null) : null,
    used: 0,
    available: null,
    limited: false,
  });
  const abortRef = React.useRef<AbortController | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const refreshCapacity = React.useCallback(async () => {
    try {
      const response = await fetch("/api/team/capacity", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as { ok: boolean; capacity?: Partial<CapacityState> };
      if (json.ok && json.capacity) {
        setCapacity((prev) => ({ ...prev, ...json.capacity }));
      }
    } catch {
      // Background refresh — silent; the panel keeps its last known state.
    }
  }, []);

  // Real-time backend context: capacity re-evaluates the moment employees or
  // memberships change anywhere (other tabs, Copilot tools, n8n).
  useSupabaseRealtime({
    table: "employees",
    filter: user.organizationId ? `organization_id=eq.${user.organizationId}` : undefined,
    onEvent: () => void refreshCapacity(),
  });
  useSupabaseRealtime({
    table: "memberships",
    filter: user.organizationId ? `organization_id=eq.${user.organizationId}` : undefined,
    onEvent: () => void refreshCapacity(),
  });

  const testConnection = React.useCallback(async () => {
    setBackend((prev) => ({ ...prev, status: "checking", message: null }));
    try {
      const response = await fetch("/api/ai/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(25_000),
      });
      const json = (await response.json()) as {
        ok: boolean;
        provider?: string;
        model?: string;
        endpoint?: string;
        message?: string;
        error?: string;
      };
      if (response.ok && json.ok) {
        setBackend({
          status: "connected",
          provider: json.provider ?? null,
          model: json.model ?? null,
          endpoint: json.endpoint ?? null,
          message: json.message ?? "Connected.",
          checkedAt: new Date().toISOString(),
        });
        toast({
          variant: "success",
          title: "AI provider connected",
          description: `${json.provider ?? "Provider"} · ${json.model ?? "model"}`,
        });
      } else {
        setBackend({
          status: "error",
          provider: null,
          model: null,
          endpoint: null,
          message: json.error ?? json.message ?? "Connection failed.",
          checkedAt: new Date().toISOString(),
        });
        toast({
          variant: "error",
          title: "AI provider unavailable",
          description: json.error ?? json.message ?? "Connection failed.",
        });
      }
    } catch (error) {
      const message =
        error instanceof Error && error.name === "TimeoutError"
          ? "Connection test timed out."
          : "Could not reach the AI bridge.";
      setBackend({ status: "error", provider: null, model: null, endpoint: null, message, checkedAt: new Date().toISOString() });
      toast({ variant: "error", title: "AI bridge unreachable", description: message });
    }
  }, [toast]);

  React.useEffect(() => {
    void refreshCapacity();
    void testConnection();
  }, [refreshCapacity, testConnection]);

  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, steps]);

  /** Shared agentic streaming runner (send + approval resends). */
  const runAgentStream = React.useCallback(
    (
      body: {
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        tools: string[];
        confirmToolCall?: { name: string; arguments: Record<string, unknown> };
      },
      streamingId: string,
      controller: AbortController,
    ) => {
      void streamAi<CopilotDoneResult>(
        "/api/ai/copilot",
        { ...body, context: { organization_id: user.organizationId } },
        {
          onDelta: (content) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingId
                  ? { ...message, text: message.text + content }
                  : message,
              ),
            );
          },
          onDone: (result) => {
            if (result.requiresConfirmation) {
              // A write tool awaits approval — keep the card, finish the bubble.
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === streamingId ? { ...message, streaming: false } : message,
                ),
              );
              return;
            }
            const normalized = normalizeResult(result);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingId
                  ? { ...message, text: normalized.text, actions: normalized.actions, streaming: false }
                  : message,
              ),
            );
            void refreshCapacity();
          },
          onToolCall: (call) => {
            setSteps((prev) => {
              const pending = prev.findIndex(
                (step) =>
                  step.name === call.name &&
                  step.status === "pending" &&
                  step.confirmationRequired,
              );
              if (pending >= 0 && !call.confirmationRequired) {
                // The user approved — flip the card from pending → executing.
                return prev.map((step, index) =>
                  index === pending
                    ? { ...step, status: "executing", confirmationRequired: false, message: undefined }
                    : step,
                );
              }
              return [
                ...prev,
                {
                  id: `step-${Date.now()}-${prev.length}`,
                  name: call.name,
                  arguments: call.arguments,
                  status: call.confirmationRequired ? "pending" : "executing",
                  confirmationRequired: call.confirmationRequired,
                  description: call.description,
                },
              ];
            });
          },
          onToolResult: (result) => {
            setSteps((prev) =>
              prev.map((step) =>
                step.name === result.tool &&
                (step.status === "executing" || step.status === "pending")
                  ? {
                      ...step,
                      status: result.ok ? "ok" : "error",
                      message: result.message,
                      data: result.data,
                    }
                  : step,
              ),
            );
          },
          onError: (message) => {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === streamingId
                  ? { ...item, text: message || "Something went wrong.", streaming: false }
                  : item,
              ),
            );
            toast({ variant: "error", title: "Copilot error", description: message });
          },
        },
        controller.signal,
      )
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === streamingId
                  ? { ...item, text: item.text || "Generation stopped.", streaming: false, aborted: true }
                  : item,
              ),
            );
            return;
          }
          setMessages((prev) =>
            prev.map((item) =>
              item.id === streamingId
                ? { ...item, text: "I couldn't reach the AI bridge. Is the Python server running?", streaming: false }
                : item,
            ),
          );
          toast({
            variant: "error",
            title: "Copilot offline",
            description: "The AI bridge could not be reached. Check the connection and retry.",
          });
        })
        .finally(() => {
          setLoading(false);
          abortRef.current = null;
        });
    },
    [toast, user.organizationId, refreshCapacity],
  );

  const send = React.useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-u`,
        role: "user",
        text: trimmed,
        actions: [],
        executions: [],
        createdAt: new Date().toISOString(),
      };
      const streamingId = `msg-${Date.now()}-a`;
      const history = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.text,
      }));

      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: streamingId, role: "assistant", text: "", actions: [], executions: [], createdAt: new Date().toISOString(), streaming: true },
      ]);
      setDraft("");
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      runAgentStream(
        { messages: history, tools: COPILOT_TOOL_NAMES },
        streamingId,
        controller,
      );
    },
    [messages, loading, runAgentStream],
  );

  const approveStep = React.useCallback(
    (step: ToolStepState) => {
      const streamingId = `msg-${Date.now()}-a`;
      setSteps((prev) =>
        prev.map((item) =>
          item.id === step.id
            ? { ...item, status: "executing", confirmationRequired: false, message: undefined }
            : item,
        ),
      );
      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: "assistant", text: "", actions: [], executions: [], createdAt: new Date().toISOString(), streaming: true },
      ]);
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const history = messages.map((message) => ({
        role: message.role,
        content: message.text,
      }));
      runAgentStream(
        {
          messages: history,
          tools: COPILOT_TOOL_NAMES,
          confirmToolCall: { name: step.name, arguments: step.arguments },
        },
        streamingId,
        controller,
      );
    },
    [messages, runAgentStream],
  );

  const denyStep = React.useCallback(
    (step: ToolStepState) => {
      setSteps((prev) =>
        prev.map((item) => (item.id === step.id ? { ...item, status: "denied" } : item)),
      );
      toast({
        variant: "info",
        title: "Action denied",
        description: `No changes were made by ${step.name}.`,
      });
    },
    [toast],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send(draft);
      }
    },
    [draft, send],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">AI Copilot</h1>
            <p className="text-sm text-muted-foreground">
              Conversational HR assistant with live workspace context
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-primary" />
            {COPILOT_TOOL_NAMES.length} tools active
          </Badge>
          {license && (
            <Badge variant="outline" className="gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              {license.tier} license
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Conversation ─────────────────────────────────────────── */}
        <section className="glass flex h-[calc(100vh-16rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border">
          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {steps.length > 0 && (
              <div className="space-y-3">
                {steps.map((step) => (
                  <ToolStepCard
                    key={step.id}
                    step={step}
                    onApprove={approveStep}
                    onDeny={denyStep}
                  />
                ))}
              </div>
            )}

            {loading && messages[messages.length - 1]?.text === "" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Copilot is thinking…
              </div>
            )}
          </div>

          {messages.length <= 1 && !loading && (
            <div className="flex flex-wrap gap-2 px-5 pb-3">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-border p-4">
            <div className="flex items-end gap-3">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about approvals, candidates, payroll, capacity… or tell me to create an expense, approve an offboarding, screen a candidate."
                className="min-h-[52px] flex-1 resize-none"
                aria-label="Copilot message"
              />
              {loading ? (
                <Button variant="outline" size="icon" onClick={stop} aria-label="Stop generation">
                  <CircleAlert className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={() => send(draft)}
                  disabled={!draft.trim()}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Enter to send · Shift+Enter for a new line. Read tools run immediately; write
              tools wait for your approval.
            </p>
          </div>
        </section>

        {/* ── Backend state context ────────────────────────────────── */}
        <aside className="space-y-4">
          <StateCard
            title="AI provider"
            icon={<Bot className="h-4 w-4" />}
            status={backend.status}
            rows={[
              { label: "Provider", value: backend.provider ?? (backend.status === "idle" ? "Checking…" : "—") },
              { label: "Model", value: backend.model ?? "—" },
              { label: "Endpoint", value: backend.endpoint ?? "—", mono: true },
            ]}
            message={backend.message}
            actionLabel={backend.status === "checking" ? "Testing…" : "Test connection"}
            actionDisabled={backend.status === "checking"}
            onAction={() => void testConnection()}
          />

          <StateCard
            title="Seat capacity"
            icon={<Users className="h-4 w-4" />}
            status={capacity.limited && capacity.used >= (capacity.limit ?? Infinity) ? "error" : "connected"}
            rows={[
              { label: "Tier", value: capacity.tier ?? "—" },
              { label: "Used", value: String(capacity.used) },
              { label: "Limit", value: capacity.limit === null ? "Unlimited" : String(capacity.limit) },
              {
                label: "Available",
                value: capacity.available === null ? "Unlimited" : String(capacity.available),
              },
            ]}
            actionLabel="Refresh"
            onAction={() => void refreshCapacity()}
          />

          {backend.status === "error" && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-destructive">Chat is in fallback mode</p>
                <p className="text-muted-foreground">
                  The AI bridge is unreachable. Configure your provider in Settings, then retry the connection.
                </p>
                <Button size="sm" variant="outline" onClick={() => void testConnection()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ── Presentation helpers ──────────────────────────────────────────────── */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isUser ? "bg-primary/15 text-primary" : "bg-primary text-primary-foreground",
        )}
      >
        {isUser ? <span className="text-xs font-semibold">You</span> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn("max-w-[80%] space-y-2", isUser && "text-right")}>
        <div
          className={cn(
            "inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border",
          )}
        >
          {message.text || <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        {message.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Zap className="h-3 w-3" />
                {action.title}
              </button>
            ))}
          </div>
        )}

        {message.executions.length > 0 && (
          <ul className="space-y-1 text-left">
            {message.executions.map((execution, index) => (
              <li key={`${message.id}-exec-${index}`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wrench className="h-3 w-3" />
                {execution}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface StateCardProps {
  title: string;
  icon: React.ReactNode;
  status: ConnectionStatus;
  rows: Array<{ label: string; value: string; mono?: boolean }>;
  message?: string | null;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
}

function StateCard({ title, icon, status, rows, message, actionLabel, actionDisabled, onAction }: StateCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        <StatusDot status={status} />
      </div>
      <dl className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={cn("truncate text-right font-medium", row.mono && "font-mono text-xs")}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {message && status === "connected" && (
        <p className="mt-2 truncate text-xs text-muted-foreground" title={message}>
          {message}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="mt-3 w-full"
        onClick={onAction}
        disabled={actionDisabled}
      >
        {status === "checking" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
        {actionLabel}
      </Button>
    </div>
  );
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  if (status === "checking") return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  if (status === "error") return <span className="h-2.5 w-2.5 rounded-full bg-destructive" aria-label="Error" />;
  if (status === "connected") return <span className="h-2.5 w-2.5 rounded-full bg-success" aria-label="Connected" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" aria-label="Idle" />;
}
