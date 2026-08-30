"use client";

import * as React from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { notifyRouteError } from "@/components/layout/route-error-toast";

/**
 * Supabase Realtime subscription hook.
 *
 * Subscribes to Postgres change events (INSERT / UPDATE / DELETE) on a table
 * and exposes the latest event + subscription status. Used by the dashboard
 * module feeds (expenses, assets, offboarding) to auto-refresh on database
 * mutations and by the Copilot to keep seat capacity live.
 *
 * Safe in demo mode: when Supabase is unconfigured the hook disables itself
 * (status stays "idle") and never throws.
 */

export type RealtimeStatus = "idle" | "connecting" | "subscribed" | "error";

export type RealtimeChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface RealtimePayload<T = Record<string, unknown>> {
  table: string;
  event: "INSERT" | "UPDATE" | "DELETE";
  new: T | null;
  old: T | null;
  receivedAt: string;
}

export interface UseSupabaseRealtimeOptions<T> {
  /** Public table name to subscribe to. */
  table: string;
  /** Optional org-scoped filter, e.g. `organization_id=eq.<uuid>`. */
  filter?: string;
  /** Change event to listen for (default "*"). */
  event?: RealtimeChangeEvent;
  /** Called with every matched change event. */
  onEvent?: (payload: RealtimePayload<T>) => void;
  /** Disable the subscription (default false). */
  enabled?: boolean;
}

export interface UseSupabaseRealtimeResult<T> {
  status: RealtimeStatus;
  lastEvent: RealtimePayload<T> | null;
  /** Manually re-subscribe (used after auth/network recovery). */
  resubscribe: () => void;
}

export function useSupabaseRealtime<T = Record<string, unknown>>({
  table,
  filter,
  event = "*",
  onEvent,
  enabled = true,
}: UseSupabaseRealtimeOptions<T>): UseSupabaseRealtimeResult<T> {
  const [status, setStatus] = React.useState<RealtimeStatus>("idle");
  const [lastEvent, setLastEvent] = React.useState<RealtimePayload<T> | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const onEventRef = React.useRef(onEvent);
  onEventRef.current = onEvent;

  const configured = Boolean(supabaseUrl() && supabasePublishableKey());

  React.useEffect(() => {
    if (!enabled || !configured) {
      setStatus("idle");
      return;
    }

    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    setStatus("connecting");

    try {
      const supabase = createClient(supabaseUrl(), supabasePublishableKey(), {
        realtime: { params: { eventsPerSecond: 5 } },
      });
      const channelName = `fx-realtime-${table}-${event}-${filter ?? "all"}`;
      channel = supabase.channel(channelName).on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event,
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          const change = payload as unknown as {
            eventType: "INSERT" | "UPDATE" | "DELETE";
            new: T | null;
            old: T | null;
          };
          const normalized: RealtimePayload<T> = {
            table,
            event: change.eventType,
            new: change.new ?? null,
            old: change.old ?? null,
            receivedAt: new Date().toISOString(),
          };
          if (!cancelled) setLastEvent(normalized);
          onEventRef.current?.(normalized);
        },
      );
      channel.subscribe((subscribeStatus: string) => {
        if (cancelled) return;
        if (subscribeStatus === "SUBSCRIBED") {
          setStatus("subscribed");
        } else if (
          subscribeStatus === "CHANNEL_ERROR" ||
          subscribeStatus === "TIMED_OUT"
        ) {
          setStatus("error");
          notifyRouteError(
            "Realtime connection dropped — showing cached data. Reconnecting…",
          );
        }
      });
    } catch {
      if (!cancelled) {
        setStatus("error");
        notifyRouteError("Realtime subscription failed — showing cached data.");
      }
    }

    return () => {
      cancelled = true;
      if (channel) {
        const supabase = createClient(supabaseUrl(), supabasePublishableKey());
        void supabase.removeChannel(channel);
      }
    };
  }, [table, filter, event, enabled, configured, attempt]);

  const resubscribe = React.useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { status, lastEvent, resubscribe };
}
