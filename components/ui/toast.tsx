"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Global toast/feedback system (Pro Max rule #2/#8: touch feedback + form
 * feedback). Provides accessible (aria-live) transient notifications for
 * success/error/info actions, wired through `useToast()`.
 */

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = React.useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within <ToastProvider>.");
  }
  return value;
}

const VARIANT_META: Record<ToastVariant, { icon: typeof Info; tone: string }> = {
  success: { icon: CheckCircle2, tone: "text-success" },
  error: { icon: XCircle, tone: "text-destructive" },
  info: { icon: Info, tone: "text-primary" },
  warning: { icon: TriangleAlert, tone: "text-warning" },
};

const AUTO_DISMISS_MS = 4200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "success" }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live region so screen readers announce toasts (Pro Max #1). */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const meta = VARIANT_META[item.variant];
            const Icon = meta.icon;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
                role="status"
                data-testid="toast"
                className="glass-strong pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-xl"
              >
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.tone)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
