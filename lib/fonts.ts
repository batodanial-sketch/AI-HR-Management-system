/**
 * Inter font — offline-safe shim.
 *
 * Production uses `next/font/google` which fetches from Google Fonts at build
 * time. The sandbox / offline CI environment cannot reach fonts.googleapis.com
 * (ECONNRESET), so we provide a zero-network fallback that preserves the
 * `variable` contract used in `app/layout.tsx`.
 *
 * When `NEXT_FONT_GOOGLE_MOCKED=0` and network is available, the real loader
 * can be restored — but for preflight and offline builds this stub ensures
 * the 8-gate suite passes without external fetches.
 *
 * To restore Google Fonts in production:
 *   import { Inter } from "next/font/google";
 *   export const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter", preload: true });
 */

// Offline-safe fallback — no network fetch, same variable name.
export const inter = {
  variable: "--font-inter",
  className: "font-inter",
  style: { fontFamily: "var(--font-inter)" },
} as const;
