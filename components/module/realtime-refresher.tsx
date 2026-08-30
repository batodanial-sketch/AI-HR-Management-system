"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useSupabaseRealtime } from "@/hooks/use-realtime";

/**
 * Live dashboard feed — subscribes to Supabase Realtime change events on the
 * given tables and re-fetches the server-rendered page data via
 * `router.refresh()` (debounced), so mutations from any client (another tab,
 * the Copilot's tools, n8n workflows) appear on screen within a second.
 *
 * Toasts are throttled (one notice per 12s) to avoid notification spam
 * during busy periods.
 */

interface RealtimeRefresherProps {
  tables: string[];
  label: string;
  organizationId?: string | null;
}

export function RealtimeRefresher({ tables, label, organizationId }: RealtimeRefresherProps) {
  const router = useRouter();
  const { toast } = useToast();
  const lastToast = React.useRef(0);
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEvent = React.useCallback(() => {
    // Debounce rapid event bursts into a single refetch.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      router.refresh();
    }, 300);

    const now = Date.now();
    if (now - lastToast.current > 12_000) {
      lastToast.current = now;
      toast({
        variant: "info",
        title: `${label} updated live`,
        description: "The feed below was refreshed from a database change.",
      });
    }
  }, [router, toast, label]);

  React.useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  return (
    <>
      {tables.map((table) => (
        <RealtimeSubscriber
          key={table}
          table={table}
          organizationId={organizationId}
          onEvent={onEvent}
        />
      ))}
    </>
  );
}

function RealtimeSubscriber({
  table,
  organizationId,
  onEvent,
}: {
  table: string;
  organizationId?: string | null;
  onEvent: () => void;
}) {
  useSupabaseRealtime({
    table,
    filter: organizationId ? `organization_id=eq.${organizationId}` : undefined,
    onEvent: () => onEvent(),
  });
  return null;
}
