/**
 * Branding helpers — hex→HSL conversion and CSS variable injection.
 * Client-safe (no server-only deps) so it runs in Providers on mount.
 */

export const DEFAULT_APP_NAME = "Fluxentiq";

export interface Hsl {
  h: number;
  s: string;
  l: string;
}

export function hexToHsl(hex: string): Hsl | null {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }

  return {
    h: Math.round(h),
    s: `${Math.round(s * 100)}%`,
    l: `${Math.round(l * 100)}%`,
  };
}

/** Sets the accent CSS variables on :root from a hex color. Returns false if invalid. */
export function applyBrandAccent(hex: string): boolean {
  const hsl = hexToHsl(hex);
  if (!hsl) {
    return false;
  }
  if (typeof document === "undefined") {
    return true;
  }
  const root = document.documentElement;
  root.style.setProperty("--accent-h", String(hsl.h));
  root.style.setProperty("--accent-s", hsl.s);
  root.style.setProperty("--accent-l", hsl.l);
  return true;
}
