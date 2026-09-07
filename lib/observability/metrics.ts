/**
 * Metrics — bounded-cardinality in-process registry with pluggable export.
 *
 * Backends (chosen by env, never by code):
 *   METRICS_BACKEND=prometheus   → exposed at GET /api/metrics (text format)
 *                                  for a Prometheus/Grafana Agent scraper
 *   METRICS_BACKEND=otlp         → pushed to OTEL_EXPORTER_OTLP_ENDPOINT
 *                                  (/v1/metrics, protobuf-less JSON encoding)
 *                                  with optional OTEL_EXPORTER_OTLP_HEADERS
 *   METRICS_BACKEND=none|unset   → registry only (still queryable in tests)
 *
 * Cardinality is bounded structurally: labels are restricted to an allowlist
 * per metric and label VALUES are normalised (routes are templated, status
 * codes bucketed to families where needed, tool names must be in the tool
 * catalog, everything else collapses to "other"). No label may ever carry a
 * user id, email, tenant id, token or free text.
 */

import { scrubString } from "./scrub";

type Labels = Record<string, string>;

interface MetricDef {
  kind: "counter" | "histogram";
  help: string;
  labels: string[];
  buckets?: number[];
}

const LATENCY_BUCKETS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];

export const METRIC_DEFS = {
  http_requests_total: { kind: "counter", help: "HTTP requests by route/method/status", labels: ["route", "method", "status"] },
  http_request_duration_ms: { kind: "histogram", help: "HTTP request latency", labels: ["route", "method"], buckets: LATENCY_BUCKETS },
  http_errors_total: { kind: "counter", help: "HTTP 4xx/5xx by family", labels: ["route", "family"] },
  ai_requests_total: { kind: "counter", help: "AI requests by feature/outcome", labels: ["feature", "outcome"] },
  ai_request_duration_ms: { kind: "histogram", help: "AI request latency", labels: ["feature"], buckets: LATENCY_BUCKETS },
  ai_failures_total: { kind: "counter", help: "AI provider failures by class", labels: ["feature", "reason"] },
  copilot_tool_calls_total: { kind: "counter", help: "Copilot tool calls by tool/outcome", labels: ["tool", "outcome"] },
  copilot_proposals_total: { kind: "counter", help: "Copilot proposals by outcome", labels: ["outcome"] },
  copilot_proposal_failures_total: { kind: "counter", help: "Proposal lifecycle failures by stage", labels: ["stage"] },
  rate_limit_events_total: { kind: "counter", help: "Rate limit rejections by scope", labels: ["scope"] },
  storage_operations_total: { kind: "counter", help: "Storage ops by op/outcome", labels: ["op", "outcome"] },
  storage_failures_total: { kind: "counter", help: "Storage failures by op/reason", labels: ["op", "reason"] },
  malware_scans_total: { kind: "counter", help: "Malware scans by verdict", labels: ["verdict"] },
  authz_denials_total: { kind: "counter", help: "Authorization denials by reason", labels: ["reason"] },
} as const satisfies Record<string, MetricDef>;

export type MetricName = keyof typeof METRIC_DEFS;

const ALLOWED_VALUES: Partial<Record<string, Set<string>>> = {
  method: new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  family: new Set(["4xx", "5xx"]),
  outcome: new Set(["ok", "error", "denied", "timeout", "budget_blocked", "rate_limited", "created", "claimed", "executed", "failed", "denied", "expired", "rejected", "quarantined", "clean", "infected", "unavailable"]),
  reason: new Set(["unavailable", "unauthorized", "rate_limited", "server_error", "timeout", "budget", "invalid_response", "unknown", "scanner_unavailable", "scanner_timeout", "too_large", "invalid_type", "malformed", "forbidden", "no_membership", "unknown_role", "cross_tenant", "expired_session", "unauthenticated", "create", "claim", "finish", "integrity", "execute"]),
  verdict: new Set(["clean", "infected", "unavailable", "timeout", "error"]),
  scope: new Set(["ip", "org", "edge"]),
  op: new Set(["upload", "download", "delete", "scan", "sign"]),
  feature: new Set(["copilot", "admin_copilot", "candidate_evaluation", "pto_evaluation", "resume_parse", "candidate_ranking", "interview_report", "insights", "engine", "status"]),
};

const MAX_SERIES = 2000;
const MAX_ROUTE_VALUES = 200;

/** Collapses a concrete path to a bounded route template. */
export function normalizeRoute(pathname: string): string {
  const templated = pathname
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .split("?")[0];
  if (!templated.startsWith("/api")) return templated.startsWith("/_next") ? "/_next/*" : "/page";
  const parts = templated.split("/").slice(0, 5);
  return parts.join("/") || "/";
}

export function normalizeStatus(status: number): string {
  if (status >= 500) return "5xx";
  if (status >= 400) return String(status);
  if (status >= 300) return "3xx";
  return "2xx";
}

interface Series {
  labels: Labels;
  value: number;
  count?: number;
  sum?: number;
  buckets?: number[];
}

class Registry {
  private series = new Map<string, Series>();
  private routeValues = new Set<string>();
  private toolNames: Set<string> | null = null;
  dropped = 0;

  setToolCatalog(names: Iterable<string>) {
    this.toolNames = new Set(names);
  }

  private sanitize(name: MetricName, labels: Labels): Labels {
    const def = METRIC_DEFS[name] as MetricDef;
    const out: Labels = {};
    for (const key of def.labels) {
      let value = String(labels[key] ?? "unknown");
      if (key === "route") {
        value = normalizeRoute(value);
        if (!this.routeValues.has(value)) {
          if (this.routeValues.size >= MAX_ROUTE_VALUES) value = "other";
          else this.routeValues.add(value);
        }
      } else if (key === "status") {
        value = /^\d{3}$/.test(value) ? normalizeStatus(Number(value)) : "other";
      } else if (key === "tool") {
        value = this.toolNames && !this.toolNames.has(value) ? "other" : value.slice(0, 60);
      } else if (ALLOWED_VALUES[key]) {
        if (!ALLOWED_VALUES[key]!.has(value)) value = "other";
      } else {
        value = "other";
      }
      out[key] = scrubString(value).slice(0, 80);
    }
    return out;
  }

  private key(name: string, labels: Labels) {
    return `${name}{${Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`).join(",")}}`;
  }

  private get(name: MetricName, labels: Labels): Series | null {
    const clean = this.sanitize(name, labels);
    const key = this.key(name, clean);
    let s = this.series.get(key);
    if (!s) {
      if (this.series.size >= MAX_SERIES) {
        this.dropped += 1;
        return null;
      }
      const def = METRIC_DEFS[name] as MetricDef;
      s = def.kind === "histogram" ? { labels: clean, value: 0, count: 0, sum: 0, buckets: new Array(def.buckets!.length + 1).fill(0) } : { labels: clean, value: 0 };
      this.series.set(key, s);
    }
    return s;
  }

  increment(name: MetricName, labels: Labels = {}, by = 1) {
    const s = this.get(name, labels);
    if (s) s.value += by;
  }

  observe(name: MetricName, valueMs: number, labels: Labels = {}) {
    const s = this.get(name, labels);
    if (!s || s.buckets === undefined) return;
    const def = METRIC_DEFS[name] as MetricDef;
    s.count! += 1;
    s.sum! += valueMs;
    const idx = def.buckets!.findIndex((b) => valueMs <= b);
    s.buckets[idx === -1 ? def.buckets!.length : idx] += 1;
  }

  snapshot() {
    const out: Array<{ name: string; labels: Labels; value: number; count?: number; sum?: number; buckets?: number[] }> = [];
    for (const [key, s] of this.series) out.push({ name: key.slice(0, key.indexOf("{")), ...s });
    return { series: out, dropped: this.dropped };
  }

  /** Prometheus text exposition format. */
  renderPrometheus(): string {
    const lines: string[] = [];
    const byName = new Map<string, Series[]>();
    for (const [key, s] of this.series) {
      const name = key.slice(0, key.indexOf("{"));
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(s);
    }
    const fmt = (labels: Labels, extra?: Labels) => {
      const all = { ...labels, ...(extra ?? {}) };
      const body = Object.keys(all).sort().map((k) => `${k}="${all[k].replace(/"/g, "'")}"`).join(",");
      return body ? `{${body}}` : "";
    };
    for (const [name, list] of byName) {
      const def = METRIC_DEFS[name as MetricName] as MetricDef;
      lines.push(`# HELP ${name} ${def.help}`, `# TYPE ${name} ${def.kind}`);
      for (const s of list) {
        if (def.kind === "counter") {
          lines.push(`${name}${fmt(s.labels)} ${s.value}`);
        } else {
          let cumulative = 0;
          def.buckets!.forEach((b, i) => {
            cumulative += s.buckets![i];
            lines.push(`${name}_bucket${fmt(s.labels, { le: String(b) })} ${cumulative}`);
          });
          lines.push(`${name}_bucket${fmt(s.labels, { le: "+Inf" })} ${s.count}`);
          lines.push(`${name}_sum${fmt(s.labels)} ${s.sum}`, `${name}_count${fmt(s.labels)} ${s.count}`);
        }
      }
    }
    lines.push(`# HELP fluxentiq_metrics_dropped_series_total Series dropped by the cardinality cap`, `# TYPE fluxentiq_metrics_dropped_series_total counter`, `fluxentiq_metrics_dropped_series_total ${this.dropped}`);
    return `${lines.join("\n")}\n`;
  }

  /** OTLP/HTTP JSON payload (metrics/v1). */
  toOtlpJson(resource: Record<string, string>) {
    const nowNano = `${Date.now()}000000`;
    const attrs = (labels: Labels) => Object.entries(labels).map(([key, value]) => ({ key, value: { stringValue: value } }));
    const metricsOut: unknown[] = [];
    const byName = new Map<string, Series[]>();
    for (const [key, s] of this.series) {
      const name = key.slice(0, key.indexOf("{"));
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(s);
    }
    for (const [name, list] of byName) {
      const def = METRIC_DEFS[name as MetricName] as MetricDef;
      if (def.kind === "counter") {
        metricsOut.push({ name, description: def.help, sum: { aggregationTemporality: 2, isMonotonic: true, dataPoints: list.map((s) => ({ attributes: attrs(s.labels), timeUnixNano: nowNano, asDouble: s.value })) } });
      } else {
        metricsOut.push({ name, description: def.help, unit: "ms", histogram: { aggregationTemporality: 2, dataPoints: list.map((s) => ({ attributes: attrs(s.labels), timeUnixNano: nowNano, count: String(s.count), sum: s.sum, bucketCounts: s.buckets!.map(String), explicitBounds: def.buckets })) } });
      }
    }
    return { resourceMetrics: [{ resource: { attributes: attrs(resource) }, scopeMetrics: [{ scope: { name: "fluxentiq" }, metrics: metricsOut }] }] };
  }

  /** Test-only. */
  __reset() {
    this.series.clear();
    this.routeValues.clear();
    this.dropped = 0;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __fluxentiqMetrics: Registry | undefined;
}

export const metrics: Registry = globalThis.__fluxentiqMetrics ?? (globalThis.__fluxentiqMetrics = new Registry());

export function metricsBackend(): "prometheus" | "otlp" | "none" {
  const v = (process.env.METRICS_BACKEND ?? "none").toLowerCase();
  return v === "prometheus" || v === "otlp" ? v : "none";
}

/** Pushes the current registry to the configured OTLP endpoint. Never throws. */
export async function flushOtlp(): Promise<{ ok: boolean; status?: number; reason?: string }> {
  if (metricsBackend() !== "otlp") return { ok: false, reason: "backend_not_otlp" };
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return { ok: false, reason: "no_endpoint" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  for (const pair of (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "").split(",")) {
    const [k, v] = pair.split("=");
    if (k && v) headers[k.trim()] = v.trim();
  }
  const resource = {
    "service.name": process.env.OTEL_SERVICE_NAME ?? "fluxentiq-web",
    "deployment.environment": process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    "service.version": process.env.APP_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  };
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/v1/metrics`, { method: "POST", headers, body: JSON.stringify(metrics.toOtlpJson(resource)), signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "unreachable" };
  }
}

/** Convenience wrapper for route handlers: times the handler and records HTTP metrics. */
export async function withHttpMetrics(request: Request, handler: () => Promise<Response>): Promise<Response> {
  const route = normalizeRoute(new URL(request.url).pathname);
  const t0 = Date.now();
  let status = 500;
  try {
    const response = await handler();
    status = response.status;
    return response;
  } finally {
    const ms = Date.now() - t0;
    metrics.increment("http_requests_total", { route, method: request.method, status: String(status) });
    metrics.observe("http_request_duration_ms", ms, { route, method: request.method });
    if (status >= 400) metrics.increment("http_errors_total", { route, family: status >= 500 ? "5xx" : "4xx" });
  }
}
