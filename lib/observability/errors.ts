/**
 * Error tracking — SaaS-agnostic capture with mandatory scrubbing,
 * correlation ids, minimised identifiers and in-process deduplication.
 *
 * Backend by env (never by code):
 *   ERROR_TRACKING_DSN=https://<key>@<host>/<project>   → Sentry-compatible
 *     envelope endpoint (works with Sentry SaaS, self-hosted Sentry, GlitchTip)
 *   ERROR_TRACKING_WEBHOOK=https://…                    → generic JSON POST
 *   unset                                               → stderr only
 *
 * Guarantees enforced HERE (tested in tests/unit/observability.test.ts):
 *   - secrets/PII are scrubbed from message, stack, extra and tags
 *   - the DSN / provider hosts never appear in the payload
 *   - tenant/user ids are minimised (prefix only)
 *   - identical fingerprints within DEDUPE_WINDOW_MS are collapsed
 *   - synthetic test events carry `synthetic: true` and a `[SYNTHETIC]` tag
 */

import { createHash } from "node:crypto";
import { minimizeId, scrubString, scrubValue } from "./scrub";

export interface CaptureContext {
  requestId?: string | null;
  route?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
  synthetic?: boolean;
}

export interface CapturedEvent {
  event_id: string;
  timestamp: string;
  level: "error";
  platform: "node";
  environment: string;
  release: string;
  fingerprint: string[];
  message: string;
  exception: { values: Array<{ type: string; value: string; stacktrace?: { frames: Array<{ filename: string; function: string; lineno?: number }> } }> };
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  user?: { id: string };
}

const DEDUPE_WINDOW_MS = 60_000;
const recent = new Map<string, number>();
let deduplicated = 0;

function parseStack(stack: string | undefined) {
  if (!stack) return undefined;
  const frames = stack
    .split("\n")
    .slice(1, 30)
    .map((line) => line.trim().replace(/^at\s+/, ""))
    .map((line) => {
      const m = line.match(/^(.*?)\s+\((.*?):(\d+):\d+\)$/) ?? line.match(/^(.*?):(\d+):\d+$/);
      if (!m) return { filename: scrubString(line).slice(0, 200), function: "?" };
      if (m.length === 4) return { function: m[1].slice(0, 120), filename: scrubString(m[2]).replace(process.cwd(), "."), lineno: Number(m[3]) };
      return { function: "?", filename: scrubString(m[1]).replace(process.cwd(), "."), lineno: Number(m[2]) };
    })
    .reverse();
  return { frames };
}

export function buildEvent(error: unknown, ctx: CaptureContext = {}): CapturedEvent {
  const err = error instanceof Error ? error : new Error(String(error));
  const type = err.name || "Error";
  const value = scrubString(err.message ?? "").slice(0, 1000);
  const fingerprint = [type, value.replace(/\d+/g, "N").slice(0, 200), ctx.route ?? ""];
  const tags: Record<string, string> = {
    ...(ctx.tags ? (scrubValue(ctx.tags) as Record<string, string>) : {}),
    ...(ctx.route ? { route: scrubString(ctx.route).slice(0, 120) } : {}),
    ...(ctx.requestId ? { request_id: ctx.requestId.slice(0, 64) } : {}),
    ...(ctx.organizationId ? { tenant: minimizeId(ctx.organizationId)! } : {}),
    ...(ctx.synthetic ? { synthetic: "true", "[SYNTHETIC]": "test-event" } : {}),
  };
  const event: CapturedEvent = {
    event_id: createHash("sha1").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 32),
    timestamp: new Date().toISOString(),
    level: "error",
    platform: "node",
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.APP_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    fingerprint,
    message: ctx.synthetic ? `[SYNTHETIC] ${value}` : value,
    exception: { values: [{ type, value, stacktrace: parseStack(err.stack) }] },
    tags,
    extra: (scrubValue({ ...(ctx.extra ?? {}), synthetic: Boolean(ctx.synthetic) }) as Record<string, unknown>) ?? {},
  };
  if (ctx.userId) event.user = { id: minimizeId(ctx.userId)! };
  return event;
}

export function fingerprintKey(event: CapturedEvent): string {
  return createHash("sha1").update(event.fingerprint.join("|")).digest("hex");
}

function parseDsn(dsn: string): { url: string; key: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

export function errorTrackingBackend(): "sentry" | "webhook" | "none" {
  if (process.env.ERROR_TRACKING_DSN) return "sentry";
  if (process.env.ERROR_TRACKING_WEBHOOK) return "webhook";
  return "none";
}

export interface CaptureResult {
  captured: boolean;
  deduplicated: boolean;
  delivered: boolean;
  backend: "sentry" | "webhook" | "none";
  eventId: string;
  status?: number;
  reason?: string;
}

/** Captures an exception. Never throws; never blocks the caller for long. */
export async function captureException(error: unknown, ctx: CaptureContext = {}): Promise<CaptureResult> {
  const event = buildEvent(error, ctx);
  const key = fingerprintKey(event);
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) {
    deduplicated += 1;
    return { captured: true, deduplicated: true, delivered: false, backend: errorTrackingBackend(), eventId: event.event_id };
  }
  recent.set(key, now);
  if (recent.size > 5000) {
    for (const [k, t] of recent) if (now - t > DEDUPE_WINDOW_MS) recent.delete(k);
  }

  const backend = errorTrackingBackend();
  if (backend === "none") {
    console.error(`[error-tracking] ${event.message}`, { request_id: ctx.requestId ?? null, route: ctx.route ?? null });
    return { captured: true, deduplicated: false, delivered: false, backend, eventId: event.event_id, reason: "no_backend" };
  }
  try {
    if (backend === "sentry") {
      const dsn = parseDsn(process.env.ERROR_TRACKING_DSN!);
      if (!dsn) return { captured: true, deduplicated: false, delivered: false, backend, eventId: event.event_id, reason: "invalid_dsn" };
      const envelope = `${JSON.stringify({ event_id: event.event_id, sent_at: event.timestamp })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
      const res = await fetch(dsn.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=fluxentiq/1.0` },
        body: envelope,
        signal: AbortSignal.timeout(5000),
      });
      return { captured: true, deduplicated: false, delivered: res.ok, backend, eventId: event.event_id, status: res.status };
    }
    const res = await fetch(process.env.ERROR_TRACKING_WEBHOOK!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), signal: AbortSignal.timeout(5000) });
    return { captured: true, deduplicated: false, delivered: res.ok, backend, eventId: event.event_id, status: res.status };
  } catch (err) {
    return { captured: true, deduplicated: false, delivered: false, backend, eventId: event.event_id, reason: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "unreachable" };
  }
}

export function errorTrackingStats() {
  return { deduplicated, trackedFingerprints: recent.size, backend: errorTrackingBackend() };
}

/** Test-only. */
export function __resetErrorTracking() {
  recent.clear();
  deduplicated = 0;
}
