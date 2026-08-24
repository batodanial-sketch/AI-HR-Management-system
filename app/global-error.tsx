"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * Root-level error boundary (Next.js `global-error`). Catches errors thrown in
 * the root layout itself (which `app/error.tsx` cannot reach) and renders a
 * minimal, on-brand fallback. Logs the error digest only — never the full
 * error object, which can carry sensitive context.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      "[fluxentiq] global error:",
      error.digest ?? error.message ?? "unknown",
    );
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#020510] font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10">
            <TriangleAlert className="h-7 w-7 text-red-400" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-[#F2F4F8]">
              Something went wrong
            </h1>
            <p className="max-w-sm text-sm text-[#9AA3B5]">
              An unexpected error occurred. Try again, or reload the page.
            </p>
          </div>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md bg-[#7C5CFF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#8F73FF]"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      </body>
    </html>
  );
}
