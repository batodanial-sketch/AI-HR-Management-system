"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";

/**
 * Background route-connection error guard.
 *
 * Listens for unhandled promise rejections and network errors raised during
 * route transitions/background data fetches, converts them into clean,
 * de-duplicated toast notifications, and lets the app continue in its
 * defensive fallback state (error boundaries + seed/demo data) instead of
 * freezing the router.
 *
 * Deliberately suppressed noise:
 *  - AbortError (intentional cancellations, e.g. stream aborts) — silent
 *  - identical messages within a 6s window — collapsed to one toast
 */

export const ROUTE_ERROR_EVENT = "fluxentiq:route-error";

export function notifyRouteError(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ROUTE_ERROR_EVENT, { detail: { message } }),
  );
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch() network failures
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "NetworkError")
  ) {
    return true;
  }
  return false;
}

export function RouteErrorToast() {
  const { toast } = useToast();
  const lastNotified = React.useRef<Map<string, number>>(new Map());

  const notify = React.useCallback(
    (message: string) => {
      const now = Date.now();
      const last = lastNotified.current.get(message) ?? 0;
      if (now - last < 6_000) return; // de-duplicate rapid repeats
      lastNotified.current.set(message, now);
      if (lastNotified.current.size > 20) lastNotified.current.clear();
      toast({
        variant: "warning",
        title: "Connection interrupted",
        description:
          message ||
          "A background request failed. The page is showing its last known state.",
      });
    },
    [toast],
  );

  React.useEffect(() => {
    const onRouteError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      notify(detail?.message ?? "A background request failed.");
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      // Suppress intentional cancellations (aborted fetches/streams).
      if (reason instanceof DOMException && reason.name === "AbortError") {
        return;
      }
      if (isNetworkFailure(reason)) {
        notify(
          "A background request failed. The page is showing its last known state.",
        );
      }
    };

    const onError = (event: ErrorEvent) => {
      // Only surface resource-load failures (a dropped chunk/asset during a
      // route transition) — runtime errors are handled by error boundaries.
      const target = event.target;
      if (target && target !== window && !(target instanceof Window)) {
        notify("A background resource failed to load. Retry the navigation.");
      }
    };

    window.addEventListener(ROUTE_ERROR_EVENT, onRouteError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener(ROUTE_ERROR_EVENT, onRouteError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, [notify]);

  return null;
}
