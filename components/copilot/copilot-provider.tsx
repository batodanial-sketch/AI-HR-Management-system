"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { streamAi } from "@/lib/ai-client";
import type { CopilotAction, CopilotMessage } from "@/lib/types";

/**
 * AI Copilot — global context + slide-over drawer.
 *
 * Provider-agnostic: the LLM vendor is resolved at runtime through the
 * platform's BYOK settings (`lib/ai-client.ts` → Python bridge → configured
 * provider), so the Copilot carries no vendor branding. The provider owns the
 * drawer's open state so any surface (top-nav trigger, candidate card) can
 * open it. Messages stream in as typed records; action cards carry a typed
 * `kind` and `target` so they can drive navigation.
 */

interface CopilotContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  send: (text: string) => void;
  messages: CopilotMessage[];
  loading: boolean;
}

const CopilotContext = React.createContext<CopilotContextValue | null>(null);

export function useCopilot(): CopilotContextValue {
  const value = React.useContext(CopilotContext);
  if (!value) {
    throw new Error("useCopilot must be used within <CopilotProvider>.");
  }
  return value;
}

/**
 * Wire shape of the bridge's Copilot "done" event, and the E2E mock's JSON
 * shape. Normalized into a typed `CopilotMessage` by `normalizeResult`.
 */
interface CopilotDoneResult {
  text?: string;
  actions?: CopilotAction[];
  actionCards?: Array<{
    title: string;
    kind: CopilotAction["kind"];
    target: string;
  }>;
}

function normalizeResult(result: CopilotDoneResult): CopilotMessage {
  let actions: CopilotAction[];
  if (result.actions && result.actions.length > 0) {
    actions = result.actions;
  } else if (result.actionCards && result.actionCards.length > 0) {
    actions = result.actionCards.map((card, index) => ({
      id: `action-${index + 1}`,
      title: card.title,
      kind: card.kind,
      target: card.target,
    }));
  } else {
    actions = [];
  }
  return {
    id: `msg-${Date.now()}`,
    role: "assistant",
    text: result.text ?? "",
    actions,
    executions: [],
    createdAt: new Date().toISOString(),
  };
}

const WELCOME_MESSAGE: CopilotMessage = {
  id: "msg-welcome",
  role: "assistant",
  text: "Hi, I'm your Fluxentiq Copilot. Ask me about approvals, candidates, payroll, or workflows.",
  actions: [],
  executions: [],
  createdAt: new Date().toISOString(),
};

export function CopilotProvider({
  organizationId,
  children,
}: {
  organizationId: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<CopilotMessage[]>([
    WELCOME_MESSAGE,
  ]);
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const send = React.useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const userMessage: CopilotMessage = {
        id: `msg-${Date.now()}-u`,
        role: "user",
        text: trimmed,
        actions: [],
        executions: [],
        createdAt: new Date().toISOString(),
      };
      const streamingId = `msg-${Date.now()}-a`;

      const history = [...messages, userMessage].map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.text,
      }));

      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          id: streamingId,
          role: "assistant",
          text: "",
          actions: [],
          executions: [],
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft("");
      setLoading(true);

      void streamAi<CopilotDoneResult>(
        "/api/ai/copilot",
        { messages: history, context: { organization_id: organizationId } },
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
            const normalized = normalizeResult(result);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingId
                  ? { ...message, text: normalized.text, actions: normalized.actions }
                  : message,
              ),
            );
          },
          onToolResult: (toolResult) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingId
                  ? {
                      ...message,
                      executions: [
                        ...message.executions,
                        `${toolResult.ok ? "✓" : "✗"} ${toolResult.message}`,
                      ],
                    }
                  : message,
              ),
            );
          },
          onError: (message) => {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === streamingId
                  ? { ...item, text: `Sorry — ${message}` }
                  : item,
              ),
            );
          },
        },
      )
        .catch(() => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === streamingId
                ? {
                    ...item,
                    text: "I couldn't reach the AI bridge. Is the Python server running?",
                  }
                : item,
            ),
          );
        })
        .finally(() => setLoading(false));
    },
    [messages, organizationId],
  );

  const value = React.useMemo<CopilotContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((prev) => !prev),
      send,
      messages,
      loading,
    }),
    [open, send, messages, loading],
  );

  return (
    <CopilotContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {open && (
          <CopilotDrawer
            messages={messages}
            loading={loading}
            draft={draft}
            onDraftChange={setDraft}
            onSend={send}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </CopilotContext.Provider>
  );
}

interface CopilotDrawerProps {
  messages: CopilotMessage[];
  loading: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  onClose: () => void;
}

function CopilotDrawer({
  messages,
  loading,
  draft,
  onDraftChange,
  onSend,
  onClose,
}: CopilotDrawerProps) {
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

  return (
    <>
      <motion.div
        key="copilot-overlay"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        key="copilot-drawer"
        data-testid="copilot-drawer"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border glass-strong"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">AI Copilot</p>
              <p className="text-xs text-muted-foreground">AI assistant</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            data-testid="copilot-close-button"
            onClick={onClose}
            aria-label="Close Copilot"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.map((message) => (
            <CopilotBubble key={message.id} message={message} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 px-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
            </div>
          )}
        </div>

        <footer className="border-t border-border p-4">
          <div className="flex items-end gap-2">
            <Textarea
              data-testid="copilot-input"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSend(draft);
                }
              }}
              placeholder="Ask about approvals, candidates, payroll…"
              className="min-h-[44px] resize-none"
            />
            <Button
              data-testid="copilot-send-button"
              size="icon"
              className="h-11 w-11"
              onClick={() => onSend(draft)}
              disabled={loading || draft.trim().length === 0}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      </motion.aside>
    </>
  );
}

function CopilotBubble({ message }: { message: CopilotMessage }) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
    >
      {!isUser && (
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> Copilot
        </div>
      )}
      <div
        data-testid="copilot-message"
        data-role={message.role}
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm border border-border bg-card",
        )}
      >
        {message.text}
      </div>
      {message.actions.length > 0 && (
        <div className="mt-2 flex w-full flex-col gap-2">
          {message.actions.map((action) => (
            <CopilotActionCard key={action.id} action={action} />
          ))}
        </div>
      )}
      {message.executions.length > 0 && (
        <div className="mt-2 flex w-full flex-col gap-1">
          {message.executions.map((execution, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs text-success"
            >
              <span>{execution}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function CopilotActionCard({ action }: { action: CopilotAction }) {
  const { setOpen } = useCopilot();
  const handleClick = () => {
    setOpen(false);
    window.location.href = action.target;
  };
  return (
    <button
      data-testid="copilot-action-card"
      onClick={handleClick}
      className="ring-hairline group flex w-full items-center justify-between rounded-lg border border-border bg-card px-3.5 py-2.5 text-left text-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="font-medium">{action.title}</span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {action.kind}
      </span>
    </button>
  );
}
