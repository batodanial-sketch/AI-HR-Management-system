import { Inter } from "next/font/google";

/**
 * Self-hosted font via next/font — bundles Inter at build time (no
 * render-blocking Google Fonts <link>, no layout shift, better LCP).
 * Geist is declared in the Tailwind font stack as a progressive fallback.
 */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
});
