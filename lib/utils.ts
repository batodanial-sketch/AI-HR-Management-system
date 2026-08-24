import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Json } from "@/lib/database.types";

/** Merges conditional class names with Tailwind-aware conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formats a number as a compact human string (1.2K, 3.4M). */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Formats a monetary amount in the given currency. */
export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Formats a date string into a readable short form. */
export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Derives initials from a full name. */
export function initials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** Stable hash of a string → hue (0-360) for deterministic avatar colors. */
export function stringHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

/** Narrows an arbitrary JSON-compatible value to the canonical `Json` type.
 * Used at the boundary where zod-parsed `Record<string, unknown>` / `unknown[]`
 * payloads are written to jsonb columns — a deliberate, safe assertion (the
 * values originate from client JSON or `.default({})`, so they are serializable). */
export function toJson(value: unknown): Json {
  return value as Json;
}
