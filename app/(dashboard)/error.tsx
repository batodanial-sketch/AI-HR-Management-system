"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Dashboard-scoped error boundary (defensive fallback state).
 *
 * Catches render/data errors inside the `(dashboard)` group while the app
 * shell (sidebar/top-nav) stays interactive. Surfaces the failure as a clean
 * toast (never a frozen route) and offers a retry that re-attempts the
 * server-rendered data fetch.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { toast } = useToast();

  useEffect(() => {
    // Log digest/message only — never the full error object (may embed data).
    console.error("[fluxentiq] dashboard error:", error.digest ?? error.message ?? "unknown");
    toast({
      variant: "error",
      title: "This page hit a data error",
      description: "The dashboard shell is still active — retry below.",
    });
  }, [error, toast]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
        <TriangleAlert className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">This section failed to load</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          The connection to the data layer was interrupted. Your work is safe —
          retry to reload this section.
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
