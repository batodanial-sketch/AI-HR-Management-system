"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Global error boundary (Pro Max #8: never skip error states). Catches render
 * errors in any route and offers a retry.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the digest + message only — never the full error object, which can
    // carry sensitive context.
    console.error(
      "[fluxentiq] route error:",
      error.digest ?? error.message ?? "unknown",
    );
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
        <TriangleAlert className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred while rendering this page.
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        <RefreshCw className="h-4 w-4" /> Try again
      </Button>
    </div>
  );
}
