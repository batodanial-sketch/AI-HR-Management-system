"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Cancel / retry buttons for a run. Rendered only when the server judged
 * the caller eligible (initiator or HR_ADMIN+) — the API re-enforces.
 */
export function RunActions({ runId, status }: { runId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"cancel" | "retry" | null>(null);
  const [message, setMessage] = React.useState<{ kind: "error" | "info"; text: string } | null>(null);

  const terminal = status === "succeeded" || status === "failed" || status === "cancelled";

  async function act(action: "cancel" | "retry") {
    if (action === "cancel" && !window.confirm("Cancel this run? In-flight steps stop; this cannot be undone.")) return;
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/workflows/runs/${runId}/${action}`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; retryAfterMs?: number | null };
      if (!response.ok || payload.ok === false) {
        const suffix = typeof payload.retryAfterMs === "number" ? ` Retry in ${Math.ceil(payload.retryAfterMs / 1000)}s.` : "";
        setMessage({ kind: "error", text: `${payload.error ?? `Could not ${action} (HTTP ${response.status}).`}${suffix}` });
        return;
      }
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Network error — nothing changed. Try again." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {!terminal && (
          <Button size="sm" variant="outline" onClick={() => act("cancel")} disabled={pending !== null} data-testid={`run-cancel-${runId}`}>
            <Ban className="h-4 w-4" /> {pending === "cancel" ? "Cancelling…" : "Cancel run"}
          </Button>
        )}
        {status === "failed" && (
          <Button size="sm" variant="outline" onClick={() => act("retry")} disabled={pending !== null} data-testid={`run-retry-${runId}`}>
            <RotateCcw className="h-4 w-4" /> {pending === "retry" ? "Retrying…" : "Retry run"}
          </Button>
        )}
      </div>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className="rounded-md border px-3 py-2 text-sm border-destructive/30 bg-destructive/10 text-destructive">
          {message.text}
        </p>
      )}
    </div>
  );
}
