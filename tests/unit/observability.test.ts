/**
 * Phase R4 — metrics cardinality bounds, secret scrubbing, error dedupe,
 * pilot controls.
 */
import { minimizeId, scrubHeaders, scrubString, scrubValue } from "@/lib/observability/scrub";
import { METRIC_DEFS, metrics, normalizeRoute, normalizeStatus } from "@/lib/observability/metrics";
import { __resetErrorTracking, buildEvent, captureException, errorTrackingStats } from "@/lib/observability/errors";
import { aiKillSwitchOn, evaluatePilotAccess, maxToolRounds, pilotAllowlist, pilotConfigFindings } from "@/lib/pilot/controls";

const ORG = "11111111-1111-4111-8111-111111111111";

describe("scrubbing", () => {
  test("credentials, JWTs, DSNs, provider hosts and emails are redacted", () => {
    const input = [
      "Authorization: Bearer abc.def.ghi",
      "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "key gsk_1234567890abcdefghijklmnop",
      "db postgres://user:pw@db.internal:5432/app",
      "url https://abcd.supabase.co/rest/v1/x?apikey=zzz",
      "mail someone@example.com",
      "sb_secret_ABCDEFGHIJKLMNOP",
    ].join(" | ");
    const out = scrubString(input);
    for (const needle of ["abc.def.ghi", "eyJhbGciOiJIUzI1NiJ9", "gsk_1234567890", "user:pw@db.internal", "abcd.supabase.co", "someone@example.com", "sb_secret_ABCDEFGHIJKLMNOP"]) {
      expect(out).not.toContain(needle);
    }
  });
  test("secret-looking keys are dropped from objects; nested structures preserved", () => {
    const out = scrubValue({ password: "x", api_key: "y", cookie: "z", resume_text: "confidential", nested: { Authorization: "Bearer q", fine: 1 }, list: [{ token: "t" }] }) as Record<string, unknown>;
    expect(out.password).toBe("[REDACTED]");
    expect(out.api_key).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    expect(out.resume_text).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).Authorization).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).fine).toBe(1);
    expect(((out.list as unknown[])[0] as Record<string, unknown>).token).toBe("[REDACTED]");
  });
  test("headers are allowlisted (cookie/authorization never included)", () => {
    const h = new Headers({ cookie: "sb=1", authorization: "Bearer x", "x-request-id": "r-1", "content-type": "application/json" });
    expect(scrubHeaders(h)).toEqual({ "content-type": "application/json", "x-request-id": "r-1" });
  });
  test("identifiers are minimised", () => expect(minimizeId(ORG)).toBe("11111111…"));
});

describe("metrics — bounded cardinality", () => {
  beforeEach(() => metrics.__reset());
  test("routes are templated and status codes bucketed", () => {
    expect(normalizeRoute(`/api/employees/${ORG}/documents/123`)).toBe("/api/employees/:id/documents");
    expect(normalizeRoute("/api/x?token=abc")).toBe("/api/x");
    expect(normalizeRoute("/dashboard/anything")).toBe("/page");
    expect(normalizeStatus(503)).toBe("5xx");
    expect(normalizeStatus(404)).toBe("404");
  });
  test("unknown label values collapse to 'other'; unknown labels are dropped", () => {
    metrics.increment("ai_failures_total", { feature: "copilot", reason: "user@example.com", email: "leak@example.com" } as never);
    const snap = metrics.snapshot().series[0];
    expect(snap.labels).toEqual({ feature: "copilot", reason: "other" });
    expect(JSON.stringify(snap)).not.toContain("example.com");
  });
  test("tool names outside the catalog collapse", () => {
    metrics.setToolCatalog(["fetch_expenses"]);
    metrics.increment("copilot_tool_calls_total", { tool: "drop_database", outcome: "ok" });
    metrics.increment("copilot_tool_calls_total", { tool: "fetch_expenses", outcome: "ok" });
    const tools = metrics.snapshot().series.map((s) => s.labels.tool).sort();
    expect(tools).toEqual(["fetch_expenses", "other"]);
  });
  test("route label space is capped", () => {
    for (let i = 0; i < 400; i += 1) metrics.increment("http_requests_total", { route: `/api/r${i}`, method: "GET", status: "200" });
    const routes = new Set(metrics.snapshot().series.map((s) => s.labels.route));
    expect(routes.size).toBeLessThanOrEqual(201);
    expect(routes.has("other")).toBe(true);
  });
  test("series cap drops instead of growing unbounded", () => {
    for (let i = 0; i < 2500; i += 1) metrics.increment("http_requests_total", { route: `/api/a${i % 150}`, method: ["GET", "POST", "PUT", "PATCH", "DELETE"][i % 5], status: String(200 + (i % 5)) });
    expect(metrics.snapshot().series.length).toBeLessThanOrEqual(2000);
  });
  test("prometheus + OTLP renderings include every required metric family", () => {
    metrics.increment("http_requests_total", { route: "/api/health", method: "GET", status: "200" });
    metrics.observe("http_request_duration_ms", 12, { route: "/api/health", method: "GET" });
    metrics.increment("http_errors_total", { route: "/api/x", family: "5xx" });
    metrics.increment("ai_requests_total", { feature: "copilot", outcome: "ok" });
    metrics.increment("ai_failures_total", { feature: "copilot", reason: "timeout" });
    metrics.increment("copilot_tool_calls_total", { tool: "fetch_expenses", outcome: "ok" });
    metrics.increment("copilot_proposal_failures_total", { stage: "claim" });
    metrics.increment("rate_limit_events_total", { scope: "org" });
    metrics.increment("storage_failures_total", { op: "upload", reason: "scanner_unavailable" });
    const text = metrics.renderPrometheus();
    for (const name of ["http_requests_total", "http_request_duration_ms_bucket", "http_errors_total", "ai_requests_total", "ai_failures_total", "copilot_tool_calls_total", "copilot_proposal_failures_total", "rate_limit_events_total", "storage_failures_total"]) {
      expect(text).toContain(name);
    }
    const otlp = metrics.toOtlpJson({ "service.name": "t" });
    expect(otlp.resourceMetrics[0].scopeMetrics[0].metrics.length).toBe(9);
    expect(Object.keys(METRIC_DEFS)).toEqual(expect.arrayContaining(["storage_failures_total", "copilot_proposal_failures_total", "rate_limit_events_total"]));
  });
});

describe("error tracking", () => {
  beforeEach(() => __resetErrorTracking());
  test("event carries correlation id, minimised tenant/user, scrubbed extras, stack frames", () => {
    const err = new Error("boom for user@example.com with Bearer abcdefg.hijklmn.opq");
    const ev = buildEvent(err, { requestId: "req-1", route: "/api/x", organizationId: ORG, userId: "99999999-9999-4999-8999-999999999999", extra: { api_key: "sk_live_1234567890abcdefghijk", ok: true } });
    expect(ev.tags.request_id).toBe("req-1");
    expect(ev.tags.tenant).toBe("11111111…");
    expect(ev.user?.id).toBe("99999999…");
    expect(ev.extra.api_key).toBe("[REDACTED]");
    expect(ev.message).not.toContain("example.com");
    expect(ev.message).not.toContain("abcdefg.hijklmn");
    expect(ev.exception.values[0].stacktrace?.frames.length).toBeGreaterThan(0);
    expect(JSON.stringify(ev)).not.toContain(ORG);
  });
  test("synthetic events are clearly marked", () => {
    const ev = buildEvent(new Error("test"), { synthetic: true });
    expect(ev.message.startsWith("[SYNTHETIC]")).toBe(true);
    expect(ev.tags.synthetic).toBe("true");
  });
  test("identical errors are deduplicated within the window", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const a = await captureException(new Error("same thing 1"), { route: "/api/x" });
    const b = await captureException(new Error("same thing 2"), { route: "/api/x" });
    const c = await captureException(new Error("different"), { route: "/api/x" });
    spy.mockRestore();
    expect(a.deduplicated).toBe(false);
    expect(b.deduplicated).toBe(true);
    expect(c.deduplicated).toBe(false);
    expect(errorTrackingStats().deduplicated).toBe(1);
  });
  test("DSN never appears in the delivered payload", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const original = global.fetch;
    global.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    process.env.ERROR_TRACKING_DSN = "https://publickey123@o1.ingest.sentry.io/42";
    try {
      const r = await captureException(new Error("delivered"), { route: "/api/y" });
      expect(r.delivered).toBe(true);
      expect(calls[0].url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
      expect(calls[0].body).not.toContain("publickey123");
      expect(calls[0].body).not.toContain("ingest.sentry.io");
    } finally {
      delete process.env.ERROR_TRACKING_DSN;
      global.fetch = original;
    }
  });
});

describe("pilot controls", () => {
  test("kill switch denies with 503 before any provider spend", () => {
    expect(aiKillSwitchOn({ AI_KILL_SWITCH: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(evaluatePilotAccess({ organizationId: ORG }, { AI_KILL_SWITCH: "true" } as NodeJS.ProcessEnv)).toMatchObject({ allowed: false, status: 503, code: "AI_DISABLED" });
  });
  test("allowlist admits only enrolled tenants; malformed entries ignored", () => {
    const env = { PILOT_ORG_ALLOWLIST: `${ORG}, not-a-uuid` } as NodeJS.ProcessEnv;
    expect(pilotAllowlist(env)).toEqual([ORG]);
    expect(evaluatePilotAccess({ organizationId: ORG }, env).allowed).toBe(true);
    expect(evaluatePilotAccess({ organizationId: "22222222-2222-4222-8222-222222222222" }, env)).toMatchObject({ allowed: false, status: 403, code: "ORG_NOT_ALLOWLISTED" });
    expect(evaluatePilotAccess({ organizationId: null }, env).allowed).toBe(false);
  });
  test("per-request ceiling and tool-round bound", () => {
    expect(evaluatePilotAccess({ organizationId: ORG, estimatedTokens: 50_000 }, { PILOT_MAX_REQUEST_TOKENS: "1000" } as NodeJS.ProcessEnv).code).toBe("REQUEST_TOO_LARGE");
    expect(maxToolRounds({ PILOT_MAX_TOOL_ROUNDS: "99" } as NodeJS.ProcessEnv)).toBe(5);
    expect(maxToolRounds({} as NodeJS.ProcessEnv)).toBe(3);
  });
  test("production readiness findings enumerate missing controls", () => {
    const findings = pilotConfigFindings({ APP_ENV: "production" } as NodeJS.ProcessEnv);
    expect(findings.join(" ")).toMatch(/PILOT_ORG_ALLOWLIST/);
    expect(findings.join(" ")).toMatch(/MALWARE_SCANNER/);
    expect(findings.join(" ")).toMatch(/STORAGE_PROVIDER/);
    expect(findings.join(" ")).toMatch(/Error tracking/);
    expect(findings.join(" ")).toMatch(/METRICS_BACKEND/);
    expect(pilotConfigFindings({ APP_ENV: "development" } as NodeJS.ProcessEnv)).toEqual([]);
  });
});
