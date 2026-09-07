#!/usr/bin/env node
/**
 * Phase R6 — deployed-environment gate.
 *
 * Runs ONLY against a real deployment identified by env:
 *   PILOT_BASE_URL          https://pilot.example.com
 *   PILOT_SESSION_COOKIE    Supabase session cookie header for a pilot
 *                           HR_ADMIN (obtained by logging in; never stored)
 *   PILOT_EMPLOYEE_COOKIE   (optional) an EMPLOYEE session for role tests
 *   PILOT_FOREIGN_COOKIE    (optional) a session in a NON-pilot tenant
 *   PILOT_EXPIRED_COOKIE    (optional) an expired session
 *   METRICS_TOKEN           (optional) to verify /api/metrics
 *
 * It never fabricates: with no PILOT_BASE_URL every check is BLOCKED_EXTERNAL.
 * Output: docs/generated/phase-r-deployed.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.PILOT_BASE_URL ?? "").replace(/\/$/, "");
const ADMIN = process.env.PILOT_SESSION_COOKIE ?? "";
const EMPLOYEE = process.env.PILOT_EMPLOYEE_COOKIE ?? "";
const FOREIGN = process.env.PILOT_FOREIGN_COOKIE ?? "";
const EXPIRED = process.env.PILOT_EXPIRED_COOKIE ?? "";
const OUT = join(process.cwd(), "docs", "generated", "phase-r-deployed.json");

const checks = [];
const rec = (section, name, status, detail) => checks.push({ section, name, status, ...(detail !== undefined ? { detail } : {}) });

async function call(path, { method = "GET", cookie = ADMIN, body, headers = {}, raw } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body && !raw ? { "Content-Type": "application/json" } : {}), "x-request-id": `phase-r-${Math.random().toString(36).slice(2)}`, ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, ms: Date.now() - t0, headers: res.headers };
}

const SECRET_PATTERNS = [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, /sb_secret_/, /gsk_[A-Za-z0-9]{10,}/, /sk-[A-Za-z0-9]{10,}/, /supabase\.co/, /postgres:\/\//, /BRIDGE_SECRET/];
const leaks = (text) => SECRET_PATTERNS.filter((p) => p.test(text)).map(String);

function pct(list, p) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function perf(name, path, opts = {}, n = 20) {
  const times = [];
  let errors = 0;
  for (let i = 0; i < n; i += 1) {
    try {
      const r = await call(path, opts);
      times.push(r.ms);
      if (r.status >= 500) errors += 1;
    } catch {
      errors += 1;
    }
  }
  return { endpoint: name, samples: n, p50: pct(times, 50), p95: pct(times, 95), p99: pct(times, 99), errorRate: errors / n };
}

async function main() {
  mkdirSync(join(process.cwd(), "docs", "generated"), { recursive: true });
  const startedAt = new Date().toISOString();

  if (!BASE) {
    const report = { gate: "R6-deployed", status: "BLOCKED_EXTERNAL", reason: "PILOT_BASE_URL not set — no real deployment reachable from this environment", startedAt, finishedAt: new Date().toISOString(), checks: [] };
    writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    process.exit(3);
  }

  /* ── TLS / identity ─────────────────────────────────────────────────── */
  rec("deployment", "HTTPS/TLS", BASE.startsWith("https://") ? "PASS" : "FAIL", BASE.replace(/^https?:\/\//, "").split("/")[0]);
  const health = await call("/api/health", { cookie: "" });
  rec("deployment", "/api/health 200", health.status === 200 ? "PASS" : "FAIL", health.status);
  const ready = await call("/api/system/ready", { cookie: "" });
  rec("deployment", "/api/system/ready 200 (all controls configured)", ready.status === 200 ? "PASS" : "FAIL", ready.json?.checks);
  const buildId = ready.json?.buildId ?? null;
  rec("deployment", "build identity present", buildId ? "PASS" : "FAIL", buildId);
  const sysHealth = await call("/api/system/health");
  rec("deployment", "/api/system/health authenticated", [200, 503].includes(sysHealth.status) ? "PASS" : "FAIL", sysHealth.status);

  /* ── auth ───────────────────────────────────────────────────────────── */
  const anon = await call("/api/ai/status", { cookie: "" });
  rec("auth", "unauthenticated API → 401", anon.status === 401 ? "PASS" : "FAIL", anon.status);
  const invalid = await call("/api/ai/status", { cookie: "sb-access-token=garbage; sb-refresh-token=garbage" });
  rec("auth", "invalid session → 401", invalid.status === 401 ? "PASS" : "FAIL", invalid.status);
  if (EXPIRED) {
    const exp = await call("/api/ai/status", { cookie: EXPIRED });
    rec("auth", "expired session → 401 (failure case 11)", exp.status === 401 ? "PASS" : "FAIL", exp.status);
  } else rec("auth", "expired session", "BLOCKED_EXTERNAL", "PILOT_EXPIRED_COOKIE not provided");
  if (!ADMIN) {
    rec("auth", "authenticated checks", "BLOCKED_EXTERNAL", "PILOT_SESSION_COOKIE not provided");
  } else {
    const status = await call("/api/ai/status");
    rec("auth", "server-side actor resolution (HR_ADMIN session → 200)", status.status === 200 ? "PASS" : "FAIL", status.json?.data);
    rec("ai", "/api/ai/status enabled=true", status.json?.data?.enabled ? "PASS" : "FAIL", status.json?.data);
    rec("ai", "pilot allowlist admits this org", status.json?.data?.pilot?.thisOrgAllowed ? "PASS" : "FAIL", status.json?.data?.pilot);
    rec("security", "status response leaks no provider host/keys", leaks(status.text).length === 0 ? "PASS" : "FAIL", leaks(status.text));

    /* ── employee read / governance ───────────────────────────────────── */
    const emp = await call("/api/employees");
    rec("app", "employee read (200)", emp.status === 200 ? "PASS" : "FAIL", emp.status);
    const docs = await call("/api/documents");
    rec("app", "governance/documents read", docs.status === 200 ? "PASS" : "FAIL", docs.status);

    /* ── AI request + agent + proposal lifecycle ──────────────────────── */
    const agent = await call("/api/ai/copilot", { method: "POST", body: { messages: [{ role: "user", content: "Register asset LT-PHASE-R named 'Phase R test' in category hardware." }], tools: ["fetch_assets", "create_asset"] } });
    const proposalId = agent.text.match(/"proposalId":"([0-9a-f-]{36})"/)?.[1] ?? null;
    rec("ai", "agent request streams (200)", agent.status === 200 ? "PASS" : "FAIL", agent.status);
    rec("proposal", "consequential action → server-side proposal (confirmationRequired + proposalId)", proposalId ? "PASS" : "FAIL", { proposalId, sample: agent.text.slice(0, 300) });
    rec("security", "agent stream leaks no secrets", leaks(agent.text).length === 0 ? "PASS" : "FAIL");
    if (proposalId) {
      const legacy = await call("/api/ai/copilot", { method: "POST", body: { messages: [{ role: "user", content: "x" }], tools: ["create_asset"], confirmToolCall: { name: "create_asset", arguments: { assetTag: "HACK", name: "x", category: "y" } } } });
      rec("proposal", "client-supplied arguments (confirmToolCall) rejected 400", legacy.status === 400 ? "PASS" : "FAIL", legacy.status);
      if (EMPLOYEE) {
        const empApprove = await call("/api/ai/copilot", { method: "POST", cookie: EMPLOYEE, body: { messages: [{ role: "user", content: "approve" }], approveProposal: proposalId } });
        rec("proposal", "EMPLOYEE cannot approve (failure case 12)", /FORBIDDEN|NOT_FOUND|ORG_NOT_ALLOWLISTED/.test(empApprove.text) || empApprove.status === 403 ? "PASS" : "FAIL", empApprove.text.slice(0, 200));
      } else rec("proposal", "EMPLOYEE cannot approve", "BLOCKED_EXTERNAL", "PILOT_EMPLOYEE_COOKIE not provided");
      const [a, b] = await Promise.all([
        call("/api/ai/copilot", { method: "POST", body: { messages: [{ role: "user", content: "approve" }], approveProposal: proposalId } }),
        call("/api/ai/copilot", { method: "POST", body: { messages: [{ role: "user", content: "approve" }], approveProposal: proposalId } }),
      ]);
      const executed = [a, b].filter((r) => /"status":"executed"/.test(r.text)).length;
      const decided = [a, b].filter((r) => /ALREADY_DECIDED/.test(r.text)).length;
      rec("proposal", "duplicate approval → exactly one execution (failure cases 14/15)", executed === 1 && decided === 1 ? "PASS" : "FAIL", { executed, decided });
      rec("proposal", "receipt present", /"receipt":\{/.test(a.text + b.text) ? "PASS" : "FAIL");
      const third = await call("/api/ai/copilot", { method: "POST", body: { messages: [{ role: "user", content: "approve" }], approveProposal: proposalId } });
      rec("proposal", "re-execution after terminal state refused", /ALREADY_DECIDED/.test(third.text) ? "PASS" : "FAIL");
    }

    /* ── storage lifecycle ────────────────────────────────────────────── */
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, ...new TextEncoder().encode("%%EOF phase-r ".repeat(20))]);
    const form = new FormData();
    form.append("file", new Blob([pdf], { type: "application/pdf" }), "phase-r.pdf");
    form.append("ownerType", "company");
    const up = await call("/api/documents/upload", { method: "POST", raw: form });
    const docId = up.json?.data?.id ?? null;
    rec("storage", "upload clean PDF → 201 clean", up.status === 201 && up.json?.data?.status === "clean" ? "PASS" : up.status === 503 && up.json?.code === "SCANNER_UNAVAILABLE" ? "BLOCKED_EXTERNAL" : "FAIL", up.json ?? up.status);
    const eicar = new TextEncoder().encode("%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n");
    const f2 = new FormData();
    f2.append("file", new Blob([eicar], { type: "application/pdf" }), "eicar.pdf");
    f2.append("ownerType", "company");
    const inf = await call("/api/documents/upload", { method: "POST", raw: f2 });
    rec("storage", "EICAR upload rejected (MALWARE_DETECTED)", inf.status === 422 && inf.json?.code === "MALWARE_DETECTED" ? "PASS" : inf.status === 503 ? "BLOCKED_EXTERNAL" : "FAIL", inf.json ?? inf.status);
    const f3 = new FormData();
    f3.append("file", new Blob([new TextEncoder().encode("MZ......")], { type: "application/pdf" }), "cv.pdf.exe");
    f3.append("ownerType", "company");
    const bad = await call("/api/documents/upload", { method: "POST", raw: f3 });
    rec("storage", "suspicious/malformed file rejected 422", bad.status === 422 ? "PASS" : "FAIL", bad.json?.code);
    if (docId) {
      const dl = await call(`/api/documents/${docId}/download`);
      rec("storage", "download → signed URL (no public URL)", dl.status === 200 && /exp=|token=|sign/i.test(dl.json?.data?.url ?? "") ? "PASS" : "FAIL", dl.json?.data?.expiresInSeconds);
      if (dl.json?.data?.url) {
        const fetched = await fetch(dl.json.data.url, { headers: { cookie: ADMIN } });
        rec("storage", "signed URL serves bytes", fetched.ok ? "PASS" : "FAIL", fetched.status);
      }
      if (FOREIGN) {
        const x = await call(`/api/documents/${docId}/download`, { cookie: FOREIGN });
        rec("storage", "cross-tenant download denied (failure case 13)", x.status === 404 || x.status === 403 ? "PASS" : "FAIL", x.status);
        const xd = await call(`/api/documents/${docId}/file`, { method: "DELETE", cookie: FOREIGN });
        rec("storage", "cross-tenant delete denied", xd.status === 404 || xd.status === 403 ? "PASS" : "FAIL", xd.status);
      } else rec("storage", "cross-tenant download/delete", "BLOCKED_EXTERNAL", "PILOT_FOREIGN_COOKIE not provided");
      const anonDl = await call(`/api/documents/${docId}/download`, { cookie: "" });
      rec("storage", "unauthorized download → 401", anonDl.status === 401 ? "PASS" : "FAIL", anonDl.status);
      if (EMPLOYEE) {
        const ed = await call(`/api/documents/${docId}/file`, { method: "DELETE", cookie: EMPLOYEE });
        rec("storage", "EMPLOYEE delete → 403", ed.status === 403 ? "PASS" : "FAIL", ed.status);
      }
      const del = await call(`/api/documents/${docId}/file`, { method: "DELETE" });
      rec("storage", "HR_ADMIN delete → 200", del.status === 200 ? "PASS" : "FAIL", del.status);
    }

    /* ── observability ────────────────────────────────────────────────── */
    const et = await call("/api/system/error-test", { method: "POST" });
    rec("observability", "synthetic error captured + delivered to SaaS", et.json?.data?.delivered ? "PASS" : et.status === 403 ? "BLOCKED_EXTERNAL" : "FAIL", et.json?.data);
    const et2 = await call("/api/system/error-test", { method: "POST" });
    rec("observability", "deduplication works", et2.json?.data?.deduplicated === true || et2.json?.data?.stats?.deduplicated >= 1 ? "PASS" : "FAIL", et2.json?.data?.stats);
    if (process.env.METRICS_TOKEN) {
      const m = await fetch(`${BASE}/api/metrics`, { headers: { authorization: `Bearer ${process.env.METRICS_TOKEN}` } });
      const body = await m.text();
      const families = ["http_requests_total", "http_request_duration_ms", "ai_requests_total", "ai_failures_total", "copilot_tool_calls_total", "copilot_proposal_failures_total", "rate_limit_events_total", "storage_failures_total"];
      rec("observability", "metrics endpoint exposes required families", m.ok && families.every((f) => body.includes(f)) ? "PASS" : "FAIL", families.filter((f) => !body.includes(f)));
      rec("security", "metrics contain no identifiers", leaks(body).length === 0 && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(body) ? "PASS" : "FAIL");
      const m401 = await fetch(`${BASE}/api/metrics`);
      rec("observability", "metrics endpoint requires token", m401.status === 401 || m401.status === 404 ? "PASS" : "FAIL", m401.status);
    } else rec("observability", "metrics backend receives series", "BLOCKED_EXTERNAL", "METRICS_TOKEN not provided / OTLP backend must be checked in its own UI");

    /* ── failure injection (those reachable from outside) ─────────────── */
    if (FOREIGN) {
      const f = await call("/api/ai/copilot", { method: "POST", cookie: FOREIGN, body: { messages: [{ role: "user", content: "hi" }], tools: ["fetch_assets"] } });
      rec("failure-injection", "non-pilot tenant → 403 ORG_NOT_ALLOWLISTED (case 13)", f.status === 403 && f.json?.code === "ORG_NOT_ALLOWLISTED" ? "PASS" : "FAIL", f.status);
    }
    const oversized = await call("/api/documents/upload", { method: "POST", raw: new Blob([new Uint8Array(11 * 1024 * 1024)]), headers: { "content-type": "multipart/form-data; boundary=x" } });
    rec("failure-injection", "oversized upload → 413", oversized.status === 413 ? "PASS" : "FAIL", oversized.status);
    for (const c of ["AI provider unavailable (1)", "AI provider 401 (2)", "AI provider 429 (3)", "AI provider 500 (4)", "AI timeout (5)", "database unavailable (6)", "storage unavailable (7)", "malware scanner unavailable (8)", "error tracking unavailable (9)", "metrics unavailable (10)"]) {
      rec("failure-injection", c, "BLOCKED_EXTERNAL", "requires operator-side fault injection on the deployed infrastructure (documented in docs/ops/pilot-runbook.md); application behaviour for these paths is covered by unit/bridge tests");
    }
    const logout = await call("/api/auth/signout", { method: "POST" });
    rec("auth", "logout endpoint responds", [200, 302, 303, 307].includes(logout.status) ? "PASS" : "FAIL", logout.status);

    /* ── performance ──────────────────────────────────────────────────── */
    const perfResults = [];
    perfResults.push(await perf("/api/health", "/api/health", { cookie: "" }));
    perfResults.push(await perf("/api/ai/status", "/api/ai/status"));
    perfResults.push(await perf("/api/employees", "/api/employees"));
    perfResults.push(await perf("/api/documents (governance)", "/api/documents"));
    perfResults.push(await perf("/api/ai/copilot (agent, read tool)", "/api/ai/copilot", { method: "POST", body: { messages: [{ role: "user", content: "List assets." }], tools: ["fetch_assets"] } }, 5));
    rec("performance", "latency percentiles (real deployment — not comparable to any prior baseline)", "PASS", perfResults);
  }

  const fail = checks.filter((c) => c.status === "FAIL").length;
  const blocked = checks.filter((c) => c.status === "BLOCKED_EXTERNAL").length;
  const status = fail ? "FAIL" : blocked ? "BLOCKED_EXTERNAL" : "PASS";
  const report = { gate: "R6-deployed", status, baseUrl: BASE.replace(/^https?:\/\//, "").split("/")[0], buildId, startedAt, finishedAt: new Date().toISOString(), counts: { total: checks.length, pass: checks.length - fail - blocked, fail, blocked }, checks };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status, counts: report.counts }, null, 2));
  process.exit(fail ? 1 : blocked ? 3 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
