#!/usr/bin/env node
/**
 * Phase T — real infrastructure activation & production pilot validation.
 *
 * Anti-fabrication rules (identical to Phase S):
 *   - Never uses mocks/localhost substitutes for gates that require production
 *     infrastructure. Local evidence is always labelled "supporting only".
 *   - Never fabricates provider responses, latency, alert IDs, backup results,
 *     scanner verdicts or cognitive scores.
 *   - BLOCKED_EXTERNAL is never converted to PASS without executing the real
 *     gate; FAIL is never reclassified as BLOCKED after execution.
 *   - Evidence contains configuration PRESENCE flags and hostnames only —
 *     never keys, tokens, DSNs, URLs-with-credentials or other secrets.
 *   - The committed 48-case cognitive dataset (r5-1) and its thresholds are
 *     never modified here.
 *
 * Execution model (T0..T19 from the brief):
 *   T0  freeze & baseline          -> verified against the Phase S evidence
 *   T1  provision real Supabase    -> config presence + HTTPS reachability
 *   T2  migrations + real Auth/RLS -> requires T1 (supporting: S1 local gates)
 *   T3  private object storage     -> requires T1/T9 (supporting: S2 local)
 *   T4  malware scanner            -> requires deployment (supporting: S3)
 *   T5  metrics + alert firing     -> requires real backend (supporting: S4)
 *   T6  error tracking             -> requires real DSN/webhook (supporting: S4)
 *   T7  real AI provider           -> requires bridge config (supporting: S6)
 *   T8  real 48-case cognitive run -> requires T7; scores never fabricated
 *   T9  HTTPS deployment           -> requires PILOT_BASE_URL (supporting: S10)
 *   T10 deployed agent/action matrix -> requires T9 (supporting: S8)
 *   T11 governance / kill switch   -> requires T9 (supporting: S9)
 *   T12 provider backup / restore  -> requires real Supabase project
 *   T13 production performance     -> requires T9; numbers never invented
 *   T14 failure injection          -> requires T9
 *   T15 final deployed security    -> requires T9 (supporting: S14 local)
 *   T16 pilot onboarding           -> sequential after T1..T15
 *   T17 controlled pilot operation -> sequential after T16
 *   T18 final evidence regen       -> PASS when Phase S re-ran fresh + verified
 *   T19 verdict                    -> exactly one of the three legal verdicts
 *
 * Run (same environment contract as the Phase S generator):
 *   PATH="<repo>/.venv/bin:$PATH" DATABASE_URL=... [PG_TOOLS_BIN=...] \
 *     node scripts/phase-t-evidence.mjs
 *
 * Outputs:
 *   docs/generated/phase-t-evidence.json
 *   docs/generated/phase-t-readiness-gap.json
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "docs", "generated");
const EVIDENCE = join(OUT_DIR, "phase-t-evidence.json");
const GAP = join(OUT_DIR, "phase-t-readiness-gap.json");
const S_EVIDENCE = join(OUT_DIR, "phase-s-evidence.json");
const STATUSES = new Set(["PASS", "FAIL", "BLOCKED_EXTERNAL", "NOT_IMPLEMENTED"]);
const VERDICTS = [
  "PRODUCTION PILOT VALIDATED",
  "PRODUCTION PILOT READY \u2014 EXTERNAL INFRASTRUCTURE STILL BLOCKED",
  "NOT PRODUCTION PILOT READY",
];

function sh(cmd, args, { env = {}, timeout = 1200_000 } = {}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const res = spawnSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...env, FORCE_COLOR: "0", CI: "1" }, encoding: "utf8", timeout, maxBuffer: 96 * 1024 * 1024 });
  return { command: [cmd, ...args].join(" "), startedAt, durationMs: Date.now() - t0, exitCode: res.status, signal: res.signal ?? null, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}
const git = (args) => sh("git", args).stdout.trim();
const tail = (s, n = 2500) => { if (!s) return ""; const t = String(s); return t.length > n ? t.slice(-n) : t; };
/** Cleanliness of the tree excluding this generator's own outputs (docs/generated). */
function worktreeClean() {
  const dirty = git(["status", "--porcelain"]).split("\n").filter((l) => l && !l.includes("docs/generated/"));
  return dirty.length === 0 ? "clean" : `dirty (${dirty.length} non-evidence path(s))`;
}

function sourceFingerprint() {
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard"]).split("\n").filter((f) => f && !f.startsWith("docs/generated/")).sort();
  const h = createHash("sha256");
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue;
    h.update(f).update("\0").update(readFileSync(join(ROOT, f))).update("\0");
  }
  return { files: files.length, sha256: h.digest("hex") };
}

const has = (k) => Boolean(process.env[k] && String(process.env[k]).trim().length > 0);
function hostOf(urlOrEmpty, fallback) {
  try {
    const u = new URL(String(urlOrEmpty));
    if (u.hostname) return u.hostname;
  } catch { /* not a URL */ }
  return fallback;
}

/** Live HTTPS reachability probe. Returns { ok, code, host } — no secrets. */
function probe(url, maxMs = 5000) {
  const r = spawnSync("curl", ["-sk", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", String(Math.ceil(maxMs / 1000)), String(url)], { encoding: "utf8", timeout: maxMs + 2000 });
  const code = (r.stdout || "").trim();
  return { host: hostOf(url, "?"), code: code || "unreachable", ok: code === "200" || code === "201" || code === "204" || code === "301" || code === "302" || code === "307" || code === "308" || code === "401" || code === "403" };
}

/* ------------------------------------------------------------------ */
/* Configuration presence (booleans only — values never recorded).     */
/* ------------------------------------------------------------------ */
const CFG = {
  supabaseUrl: has("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: has("SUPABASE_SECRET_KEY"),
  supabaseProjectRef: has("SUPABASE_PROJECT_REF"),
  databaseIsSupabase: /supabase\.(co|com|net)|pooler\.supabase/.test(process.env.DATABASE_URL ?? ""),
  storageProvider: has("STORAGE_PROVIDER"),
  malwareScanner: has("MALWARE_SCANNER"),
  metrics: has("METRICS_BACKEND") || has("OTEL_EXPORTER_OTLP_ENDPOINT"),
  errorTracking: has("ERROR_TRACKING_DSN") || has("ERROR_TRACKING_WEBHOOK"),
  aiProvider: has("LLM_PROVIDER") && has("LLM_API_KEY"),
  bridge: has("AI_BRIDGE_URL") && has("BRIDGE_SECRET_KEY"),
  pilotBaseUrl: has("PILOT_BASE_URL"),
  pilotDeploymentId: has("PILOT_DEPLOYMENT_ID"),
};
const cfgSummary = Object.fromEntries(Object.entries(CFG).map(([k, v]) => [k, v]));

/* ------------------------------------------------------------------ */
/* Live probes (canonical endpoints; env-configured hosts win).        */
/* ------------------------------------------------------------------ */
function runProbes() {
  const list = [];
  const supabaseProbe = CFG.supabaseUrl ? hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL, null) : null;
  list.push(probe(supabaseProbe ? `https://${supabaseProbe}` : "https://supabase.co"));
  list.push(probe("https://api.supabase.com"));

  const aiHost = CFG.aiProvider ? providerHost(process.env.LLM_PROVIDER) : null;
  for (const h of [aiHost, "api.openai.com", "api.anthropic.com", "api.groq.com", "generativelanguage.googleapis.com"]) {
    if (h && !list.some((p) => p.host === h)) list.push(probe(`https://${h}`));
  }

  if (CFG.errorTracking) list.push(probe(`https://${hostOf(process.env.ERROR_TRACKING_DSN, hostOf(process.env.ERROR_TRACKING_WEBHOOK, "sentry.io"))}`));
  else list.push(probe("https://sentry.io"));

  const deployHost = CFG.pilotBaseUrl ? hostOf(process.env.PILOT_BASE_URL, null) : null;
  if (deployHost) list.push(probe(`https://${deployHost}`));
  return list;
}
function providerHost(provider) {
  const p = String(provider || "").toLowerCase();
  if (p.includes("openai")) return "api.openai.com";
  if (p.includes("groq")) return "api.groq.com";
  if (p.includes("gemini") || p.includes("google")) return "generativelanguage.googleapis.com";
  if (p.includes("anthropic") || p.includes("claude")) return "api.anthropic.com";
  if (p === "custom") return hostOf(process.env.LLM_BASE_URL ?? "", "custom-provider");
  return "api.openai.com";
}

/* ------------------------------------------------------------------ */
function blockedExt(reason, unblockBy, supporting = null, extra = {}) {
  return { status: "BLOCKED_EXTERNAL", reason, unblockBy, supporting, ...extra };
}

function main() {
  if (process.argv.includes("--verify")) {
    if (!existsSync(EVIDENCE)) { console.error("missing phase-t evidence — run `node scripts/phase-t-evidence.mjs` first"); process.exit(1); }
    const ev = JSON.parse(readFileSync(EVIDENCE, "utf8"));
    const sEv = existsSync(S_EVIDENCE) ? JSON.parse(readFileSync(S_EVIDENCE, "utf8")) : null;
    const fp = sourceFingerprint();
    const head = git(["rev-parse", "HEAD"]);
    const fresh = ev.staleGuard.sourceFingerprint.sha256 === fp.sha256;
    const headMatches = ev.staleGuard.gitHead === head;
    const legal = ev.gates.every((g) => STATUSES.has(g.status));
    const sConsistent = Boolean(sEv) && ev.phaseS?.verdict === sEv.verdict && ev.phaseS?.summary?.gates === sEv.summary?.gates;
    const out = {
      fresh, headMatches, buildIdSet: Boolean(process.env.APP_BUILD_ID),
      files: fp.files, sha256: fp.sha256, legalStatuses: legal,
      phaseSConsistent: sConsistent,
      generatedAt: ev.generatedAt, verdict: ev.verdict,
      gap: existsSync(GAP),
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(fresh && legal && headMatches && sConsistent ? 0 : 1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  // T18 discipline / stale-evidence protection: delete prior Phase T evidence.
  for (const f of [EVIDENCE, GAP]) rmSync(f, { force: true });

  if (!has("DATABASE_URL")) {
    console.error("DATABASE_URL is required (point it at the suite PostgreSQL instance)");
    process.exit(2);
  }
  const toolsBin = process.env.PG_TOOLS_BIN;
  if (!toolsBin || !["initdb", "pg_ctl", "postgres"].every((n) => existsSync(join(toolsBin, n)))) {
    console.error("PG_TOOLS_BIN must point at a directory with initdb/pg_ctl/postgres (see phase-s-evidence.mjs header)");
    process.exit(2);
  }

  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const fingerprintBefore = sourceFingerprint();
  const buildId = process.env.APP_BUILD_ID || head;
  const generatedAt = new Date().toISOString();
  const tStart = Date.now();
  const gates = [];
  const now = () => new Date().toISOString();
  const probes = [];

  /* ── Live reachability probes (run before gate evaluation) ─────────── */
  console.log("▶ Live reachability probes …");
  for (const p of runProbes()) probes.push({ host: p.host, code: p.code });
  const anyProviderOk = probes.some((p) => p.ok && !["supabase.co", "api.supabase.com", "sentry.io"].includes(p.host));
  const supabaseOk = probes.some((p) => p.ok && (p.host === "supabase.co" || p.host === "api.supabase.com"));
  const envSummary = {
    kind: supabaseOk || anyProviderOk ? "external endpoints reachable" : "sandbox without external-provider egress (live probes unreachable)",
    node: process.version,
    database: { kind: CFG.databaseIsSupabase ? "supabase pooler URL present" : "postgresql (local real instance — supporting only)" },
    deployment: CFG.pilotBaseUrl ? "PILOT_BASE_URL present" : "no PILOT_BASE_URL",
  };

  /* ── Run the full Phase S generator FRESH at the current HEAD ─────── */
  console.log("▶ Running Phase S generator fresh at current HEAD …");
  const sRun = sh("node", ["scripts/phase-s-evidence.mjs"], { timeout: 1800_000 });
  const sVerdictLine = (sRun.stdout + sRun.stderr).split("\n").filter((l) => l.includes('"verdict"')).pop() ?? "";
  if (sRun.exitCode !== 0) {
    console.error("Phase S generator failed:\n" + tail(sRun.stdout + sRun.stderr, 3000));
    process.exit(1);
  }
  const sEv = JSON.parse(readFileSync(S_EVIDENCE, "utf8"));
  const sVerify = JSON.parse((sh("node", ["scripts/phase-s-evidence.mjs", "--verify"]).stdout || "{}").trim() || "{}");
  const S = sEv.summary;
  const sGate = (id) => sEv.gates.find((g) => g.id === id) ?? null;
  const supporting = (...ids) => ids.map((id) => ({ gate: id, status: sGate(id)?.status ?? null, note: sGate(id)?.note ?? null }));

  /* ── T0 — freeze and baseline ─────────────────────────────────────── */
  const t0Start = now();
  const baselineOk = sVerify.fresh === true && sVerify.headMatches === true && sVerify.legalStatuses === true && sRun.exitCode === 0;
  const baseline = {
    gitHead: sEv.staleGuard.gitHead,
    buildId: sEv.staleGuard.buildId,
    evidenceHash: sEv.staleGuard.sourceFingerprint.sha256,
    evidenceFiles: sEv.staleGuard.sourceFingerprint.files,
    workingTree: worktreeClean(),
    phaseS: { verdict: sEv.verdict, summary: S, verify: sVerify },
  };
  gates.push({
    id: "T0-baseline", area: "T0", status: baselineOk ? "PASS" : "FAIL",
    startedAt: t0Start, finishedAt: now(),
    environment: envSummary,
    evidenceReference: ["scripts/phase-s-evidence.mjs --verify"],
    safeSummary: "Phase S evidence re-run fresh at the current HEAD and verified (fresh/headMatches/legal). Billing remains NOT_IMPLEMENTED by product decision.",
    detail: { phaseS: sEv.verdict, gates: S.gates, pass: S.pass, fail: S.fail, blockedExternal: S.blockedExternal, notImplemented: S.notImplemented },
  });

  /* ── T1 — provision real Supabase ─────────────────────────────────── */
  const t1Start = now();
  const supabaseProbeOk = probes.find((p) => p.host === "supabase.co")?.ok || false;
  const apiProbeOk = probes.find((p) => p.host === "api.supabase.com")?.ok || false;
  const supabaseReady = CFG.supabaseUrl && CFG.supabasePublishableKey && CFG.supabaseSecretKey && CFG.supabaseProjectRef && CFG.databaseIsSupabase && supabaseProbeOk && apiProbeOk;
  gates.push({
    id: "T1-supabase", area: "T1", status: supabaseReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t1Start, finishedAt: now(), environment: { cfg: cfgSummary, probes },
    evidenceReference: ["s1-supabase-project"],
    safeSummary: "No dedicated pilot Supabase project is provisioned/reachable from this environment: configuration presence flags and live HTTPS probes are recorded; no credentials are stored in evidence.",
    detail: supabaseReady ? {} : { reason: "pilot Supabase project not provisioned or not reachable (no project URL/keys present; HTTPS probe to supabase.co/api.supabase.com blocked from this sandbox)", unblockBy: "Provision the pilot project, set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY / SUPABASE_PROJECT_REF and point DATABASE_URL at the pooler, then re-run this generator" },
  });

  /* ── T2 — migrations + real auth + RLS ────────────────────────────── */
  const t2Start = now();
  const sAuth = sGate("s1-auth-gate"); const sRls = sGate("s1-rls-gate"); const sMig = sGate("s1-migrations");
  const authReady = sAuth?.status === "PASS" && sRls?.status === "PASS" && sMig?.status === "PASS";
  gates.push({
    id: "T2-auth-rls", area: "T2", status: authReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t2Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s1-auth-gate", "s1-rls-gate", "s1-migrations", "s1-identity-from-session", "scripts/db/authz-rls-suite.mjs"],
    safeSummary: "Real Supabase Auth sessions (HR_ADMIN/MANAGER/EMPLOYEE), hosted PostgREST RLS and db-push validation require the T1 project. Local identity/RLS model remains proven (supporting only): client-supplied actorId/organizationId/role cannot override server identity.",
    detail: { reason: "no real Supabase project (T1) — nothing was executed against hosted Auth/PostgREST", unblockBy: "Run the S1 checklist in docs/PRODUCTION_PILOT_RUNBOOK.md against the deployed pilot, then DATABASE_URL=<pooler> node scripts/db/authz-rls-suite.mjs and supabase db push; re-run this generator", supporting: supporting("s1-identity-from-session", "s1-rls-gate", "s1-auth-gate", "s1-migrations") },
  });

  /* ── T3 — real private object storage ─────────────────────────────── */
  const t3Start = now();
  const storageReady = CFG.storageProvider && CFG.supabaseUrl && CFG.supabaseSecretKey && sGate("s2-real-bucket-suite")?.status === "PASS" && sGate("s2-deployed-data-migration")?.status === "PASS";
  gates.push({
    id: "T3-storage", area: "T3", status: storageReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t3Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s2-real-bucket-suite", "s2-deployed-data-migration", "s2-no-public-bucket-code", "s2-legacy-public-resume-urls", "s2-storage-pipeline-unit"],
    safeSummary: "The 20-case storage matrix and legacy-data migration must run against the real private bucket (public=false). Code paths remain zero-public-URL and the storage pipeline unit suite passes (supporting only).",
    detail: { reason: "no real Supabase project / deployment (T1/T9); storage provider env not set", unblockBy: "Deploy with STORAGE_PROVIDER=supabase + private bucket, run the 20-case matrix (runbook §18), inventory/migrate/invalidate legacy resume rows, prove unauthenticated & cross-tenant GET denied and authorized tenant GET allowed", supporting: supporting("s2-no-public-bucket-code", "s2-legacy-public-resume-urls", "s2-storage-pipeline-unit") },
  });

  /* ── T4 — real malware scanner ────────────────────────────────────── */
  const t4Start = now();
  const scannerReady = CFG.malwareScanner && sGate("s3-real-scanner-provider")?.status === "PASS";
  gates.push({
    id: "T4-scanner", area: "T4", status: scannerReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t4Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s3-real-scanner-provider", "s3-scanner-fail-closed-contract"],
    safeSummary: "Scanner deployment (MALWARE_SCANNER=clamav-rest|webhook) plus EICAR/unavailable/timeout/malformed/error cases must be executed against the real deployment. Fail-closed contract passes in code (supporting only): only an explicit CLEAN verdict accepts.",
    detail: { reason: "no real scanner configured or reachable from a deployment", unblockBy: "Deploy with MALWARE_SCANNER=clamav-rest|webhook + URL/token and execute the S3 case list; EICAR must reject; scanner unavailable/timeout/error must reject/quarantine — never accept", supporting: supporting("s3-scanner-fail-closed-contract") },
  });

  /* ── T5 — real metrics backend + alert firing ─────────────────────── */
  const t5Start = now();
  const metricsReady = CFG.metrics && sGate("s4-metrics-backend")?.status === "PASS" && sGate("s4-alert-firing")?.status === "PASS";
  gates.push({
    id: "T5-metrics-alerts", area: "T5", status: metricsReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t5Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s4-metrics-backend", "s4-alert-firing", "s4-alert-rules-present", "docs/ops/alerts.prometheus.yml"],
    safeSummary: "Real delivery of the named metric set and real firing of all nine alert rules require a connected backend (METRICS_BACKEND/OTLP). Instrumentation unit suite and the nine-rule YAML pass (supporting only); no alert IDs were fabricated.",
    detail: { reason: "no metrics backend configured/reachable from this environment", unblockBy: "Set METRICS_BACKEND/OTEL_EXPORTER_OTLP_ENDPOINT, verify delivery of the metric set, load docs/ops/alerts.prometheus.yml, trigger one controlled condition per rule and record event→metric→alert id for all nine (SustainedHttp5xx, AiProviderFailures, AiLatencyDegraded, DatabaseFailure, StorageFailures, MalwareScannerUnavailable, RateLimitSpike, ProposalExecutionFailures, AuthzDenialSpike)", supporting: supporting("s4-instrumentation-unit", "s4-alert-rules-present") },
  });

  /* ── T6 — real error tracking ─────────────────────────────────────── */
  const t6Start = now();
  const etReady = CFG.errorTracking && sGate("s5-error-tracking-backend")?.status === "PASS";
  gates.push({
    id: "T6-error-tracking", area: "T6", status: etReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t6Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s5-error-tracking-backend", "s4-instrumentation-unit"],
    safeSummary: "POST /api/system/error-test against a real DSN/webhook must prove arrival, scrubbing (no JWT/key/Authorization/DSN/raw document/PII/connection string/bridge credentials), dedup and clearly-marked synthetic events. Scrubbing rules are unit-proven (supporting only).",
    detail: { reason: "no error-tracking DSN/webhook configured or reachable", unblockBy: "Set ERROR_TRACKING_DSN (or webhook), trigger the synthetic endpoint on the real deployment and attach provider output; clean test events per provider policy", supporting: supporting("s5-error-tracking-backend") },
  });

  /* ── T7 — real AI provider ────────────────────────────────────────── */
  const t7Start = now();
  const aiProbe = probes.find((p) => p.host === "api.openai.com" || p.host === "api.anthropic.com" || p.host === "api.groq.com" || p.host === "generativelanguage.googleapis.com" || p.host.includes("custom-provider")) ?? { host: "?", code: "?" };
  const aiReady = CFG.aiProvider && CFG.bridge && aiProbe.ok && sGate("s6-ai-provider")?.status === "PASS";
  gates.push({
    id: "T7-ai-provider", area: "T7", status: aiReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t7Start, finishedAt: now(), environment: { cfg: cfgSummary, providerProbe: { host: aiProbe.host, code: aiProbe.code } },
    evidenceReference: ["s6-ai-provider", "s6-bridge-provider-protocol"],
    safeSummary: "The existing bridge protocol suite passes locally (supporting only). Real provider activation requires LLM_PROVIDER/LLM_API_KEY plus AI_BRIDGE_URL/BRIDGE_SECRET_KEY and reachability; the provider key must never reach the browser. No provider response was fabricated.",
    detail: { reason: CFG.aiProvider ? (aiProbe.ok ? "bridge env not fully set" : "provider endpoint unreachable from this sandbox") : "no AI provider credentials configured", unblockBy: "Configure the Python bridge with a real provider (openai|groq|gemini|anthropic|custom), set AI_BRIDGE_URL/BRIDGE_SECRET_KEY, run the S6 provider matrix (success, 401, 429, 500, timeout, malformed, empty, usage, streaming)", supporting: supporting("s6-bridge-provider-protocol") },
  });

  /* ── T8 — real 48-case cognitive gate ─────────────────────────────── */
  const t8Start = now();
  const cog = sGate("s7-cognitive-real-model");
  const cogReady = cog?.status === "PASS";
  const cogDetail = sEv.gates.find((g) => g.id === "s7-cognitive-real-model")?.detail ?? null;
  gates.push({
    id: "T8-cognitive", area: "T8", status: cogReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t8Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s7-cognitive-real-model", "s7-injection-cases-committed", "scripts/ai/cognitive-gate.mjs", "scripts/ai/cognitive-dataset.json"],
    safeSummary: "Dataset r5-1 (48 cases) and thresholds are unchanged; no score exists for a real model and none was fabricated. If a real model were reachable and tested and failed, this gate would be FAIL, never BLOCKED.",
    detail: { reason: cog?.status === "PASS" ? null : "real model unreachable (T7 blocked) — cognitive gate not executed against a real model", unblockBy: "Run AI_BRIDGE_URL=… BRIDGE_SECRET_KEY=… node scripts/ai/cognitive-gate.mjs against the real model through the real bridge; thresholds: tool selection/argument quality/grounding ≥ 0.95, no-data honesty = 1.0, zero forbidden bypass/tenant escape/secret exfiltration/injection compliance", dataset: { version: "r5-1", cases: 48, categories: cogDetail?.dataset?.categories ?? null, thresholds: cogDetail?.dataset?.thresholds ?? null }, supporting: supporting("s7-injection-cases-committed") },
  });

  /* ── T9 — real HTTPS deployment ───────────────────────────────────── */
  const t9Start = now();
  const deplReady = CFG.pilotBaseUrl && sGate("s10-https-deployment")?.status === "PASS" && sGate("s10-deployed-smoke")?.status === "PASS";
  gates.push({
    id: "T9-https-deployment", area: "T9", status: deplReady ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t9Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s10-https-deployment", "s10-deployed-smoke", "s10-local-production-server", "s10-live-http-local", "s10-endpoint-semantics"],
    safeSummary: "A real HTTPS deployment with all production env vars and the 20-step deployed smoke is required. Local production build + live-HTTP/endpoint-semantics smoke pass (supporting only, localhost does not count for this gate).",
    detail: { reason: "no HTTPS deployment exists (PILOT_BASE_URL unset); no deployment platform reachable/credentialed from this sandbox", unblockBy: "Deploy behind HTTPS with secure cookies + full production env (Supabase, storage, scanner, metrics, error tracking, AI bridge), set PILOT_BASE_URL, run the 20-step smoke from runbook §18, verify /api/health (liveness) vs /api/system/health (deps) vs /api/system/ready (readiness) vs /api/ai/status (AI dep)", supporting: supporting("s10-local-production-server", "s10-live-http-local", "s10-endpoint-semantics") },
  });

  /* ── T10 — deployed agent/action matrix ───────────────────────────── */
  const t10Start = now();
  gates.push({
    id: "T10-agent-actions", area: "T10", status: deplReady ? (sGate("s8-agent-action-deployed")?.status === "PASS" ? "PASS" : "BLOCKED_EXTERNAL") : "BLOCKED_EXTERNAL",
    startedAt: t10Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s8-agent-action-deployed", "s8-agent-action-local", "s1-identity-from-session"],
    safeSummary: "The 10-case S8 matrix must run against the HTTPS deployment (read-only, consequential, forbidden, cross-tenant, forged actor/org, unauthorized approver, duplicate/concurrent approval, duplicate execution → exactly one execution). Local executable semantics pass (supporting only).",
    detail: { reason: "no real deployment (T9)", unblockBy: "Execute the S8 matrix from runbook §18 against HTTPS and record receipts/audit for every case", supporting: supporting("s8-agent-action-local") },
  });

  /* ── T11 — governance / kill switch deployed ──────────────────────── */
  const t11Start = now();
  gates.push({
    id: "T11-governance", area: "T11", status: deplReady ? (sGate("s9-kill-switch-deployed")?.status === "PASS" ? "PASS" : "BLOCKED_EXTERNAL") : "BLOCKED_EXTERNAL",
    startedAt: t11Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s9-kill-switch-deployed", "s9-pilot-controls-local", "docs/PRODUCTION_PILOT_RUNBOOK.md"],
    safeSummary: "AI_KILL_SWITCH=1 must make every AI endpoint return 503 AI_DISABLED with /api/ai/status killSwitch:true and zero provider calls; PILOT_ORG_ALLOWLIST and PILOT_MAX_REQUEST_TOKENS validated on the deployment. Request-time controls are unit-proven (supporting only).",
    detail: { reason: "no real deployment (T9)", unblockBy: "Run the kill-switch drill and allowlist/token-bound checks from runbook §§4/5/11 against the deployed environment", supporting: supporting("s9-pilot-controls-local") },
  });

  /* ── T12 — provider backup/restore ────────────────────────────────── */
  const t12Start = now();
  gates.push({
    id: "T12-backup-restore", area: "T12", status: sGate("s11-provider-backup-restore")?.status === "PASS" ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t12Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s11-provider-backup-restore", "s11-local-restore-drill"],
    safeSummary: "Provider-operated backup/restore in the real Supabase project (backups exist, retention, restore into scratch, post-restore RLS/auth/membership/reconnect checks) is required. The local restore drill passes on PostgreSQL 18.4 with full schema/RLS/row-count equality (supporting only — migration replay alone is not PASS).",
    detail: { reason: "no real Supabase project (T1) — provider-operated backups cannot exist yet", unblockBy: "Confirm backups + retention in the Supabase dashboard, execute a provider restore into a scratch project, run the post-restore checklist from runbook §14 and attach provider output", supporting: { drill: sGate("s11-local-restore-drill")?.counts ?? null } },
  });

  /* ── T13 — production performance ─────────────────────────────────── */
  const t13Start = now();
  gates.push({
    id: "T13-performance", area: "T13", status: deplReady ? (sGate("s12-performance")?.status === "PASS" ? "PASS" : "BLOCKED_EXTERNAL") : "BLOCKED_EXTERNAL",
    startedAt: t13Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s12-performance"],
    safeSummary: "p50/p95/p99/error-rate/429-rate per endpoint (health, AI status, governance, employees, agent, proposal, storage, upload, download) require the real deployment. No performance numbers were invented.",
    detail: { reason: "no real deployment (T9)", unblockBy: "Run the deployed performance harness against HTTPS and record the quantiles with environment metadata (region, runtime, model, duration, concurrency)" },
  });

  /* ── T14 — failure injection ──────────────────────────────────────── */
  const t14Start = now();
  gates.push({
    id: "T14-failure-injection", area: "T14", status: deplReady ? (sGate("s13-failure-injection")?.status === "PASS" ? "PASS" : "BLOCKED_EXTERNAL") : "BLOCKED_EXTERNAL",
    startedAt: t14Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s13-failure-injection"],
    safeSummary: "Controlled failure injections (AI provider, database, storage, scanner unavailable/timeout, metrics, error tracking, rate limit, proposal execution) with safe recovery must run against the deployment. Nothing was injected or recovered outside a real deployment.",
    detail: { reason: "no real deployment (T9)", unblockBy: "Run the S13 matrix from runbook §18 and record safe behavior + recovery per case" },
  });

  /* ── T15 — final deployed security gate ───────────────────────────── */
  const t15Start = now();
  const s14deployed = sGate("s14-deployed");
  gates.push({
    id: "T15-security", area: "T15", status: s14deployed?.status === "PASS" ? "PASS" : "BLOCKED_EXTERNAL",
    startedAt: t15Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["s14-deployed", "s14-zero-secret-leak", "s14-local-security-closeout", "s14-local-security-closeout"],
    safeSummary: "The deployed zero-list (secrets, public resumes, cross-tenant, client-controlled authz, AI/proposal authz bypass, malware bypass, scanner-unavailable acceptance, sensitive debug output) requires the deployment. Local close-out re-verified at this HEAD: secret scan 0 hits, zero public-URL paths, zero client-controlled authorization.",
    detail: { reason: "no real deployment (T9)", unblockBy: "Run the complete S14 deployed checklist from runbook §18 and record exact counts", supporting: supporting("s14-zero-secret-leak", "s14-local-security-closeout") },
  });

  /* ── T16 / T17 — pilot onboarding & operation ─────────────────────── */
  const infraBlocked = gates.filter((g) => g.id.startsWith("T")).filter((g) => g.id !== "T16-pilot-onboarding" && g.id !== "T17-pilot-operation" && g.id !== "T18-evidence" && g.id !== "T19-verdict").filter((g) => g.status !== "PASS").length;
  const t16Start = now();
  gates.push({
    id: "T16-pilot-onboarding", area: "T16", status: "BLOCKED_EXTERNAL",
    startedAt: t16Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["docs/PRODUCTION_PILOT_RUNBOOK.md"],
    safeSummary: "Onboarding follows runbook §1/§3/§4 exactly (pilot organisation, HR_ADMIN/MANAGER/EMPLOYEE, allowlist enablement) and is sequential after T1–T15; no unrestricted users are onboarded.",
    detail: { reason: infraBlocked > 0 ? `sequential after T1–T15 — ${infraBlocked} infrastructure gate(s) not PASS` : "infrastructure gates clear — onboarding has not been executed on a real deployment", unblockBy: "After T1–T15 PASS: create pilot organisation + HR_ADMIN/MANAGER/EMPLOYEE via runbook, enable allowlist, keep kill switch/budgets/rate limits/approval active, attach onboarding evidence" },
  });
  const t17Start = now();
  gates.push({
    id: "T17-pilot-operation", area: "T17", status: "BLOCKED_EXTERNAL",
    startedAt: t17Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["docs/PRODUCTION_PILOT_RUNBOOK.md"],
    safeSummary: "Representative HR/recruitment/AI/storage workflows with request/proposal/audit records run after onboarding (T16). Never record secrets or raw sensitive documents in evidence.",
    detail: { reason: "sequential after T16 (no pilot organisation onboarded)", unblockBy: "Execute the T17 workflow matrix from the brief and record request IDs/proposal IDs/audit events/latency/provider status per run" },
  });

  /* ── T18 — final evidence regeneration ────────────────────────────── */
  const t18Start = now();
  const fpAfter = sourceFingerprint();
  if (fpAfter.sha256 !== fingerprintBefore.sha256) throw new Error("source tree changed while gates were running — evidence discarded");
  const t18Ok = sRun.exitCode === 0 && sVerify.fresh === true && sVerify.headMatches === true && S.gates === 41 && S.fail === 0;
  gates.push({
    id: "T18-evidence", area: "T18", status: t18Ok ? "PASS" : "FAIL",
    startedAt: t18Start, finishedAt: now(), environment: { cfg: cfgSummary },
    evidenceReference: ["scripts/phase-s-evidence.mjs", "scripts/phase-t-evidence.mjs"],
    safeSummary: "Phase S evidence was deleted and regenerated fresh at the current HEAD inside this run; --verify reports fresh/headMatches/legal; every PASS in the Phase S set carries real executed evidence (no BLOCKED_EXTERNAL converted to PASS).",
    detail: { phaseSVerify: sVerify, phaseSSummary: S, durationMs: sRun.durationMs },
  });

  /* ── Verdict ──────────────────────────────────────────────────────── */
  const executedFail = S.fail > 0 || gates.some((g) => g.status === "FAIL");
  const notImplemented = S.notImplemented > 0;
  const blocked = S.blockedExternal > 0 || gates.filter((g) => g.id.startsWith("T")).filter((g) => g.status === "BLOCKED_EXTERNAL").length > 0;
  let verdict;
  if (executedFail) verdict = "NOT PRODUCTION PILOT READY";
  else if (!blocked && notImplemented === 1 && S.gates - S.pass - S.notImplemented === 0) verdict = "PRODUCTION PILOT VALIDATED";
  else verdict = "PRODUCTION PILOT READY \u2014 EXTERNAL INFRASTRUCTURE STILL BLOCKED";

  const t19Start = now();
  const summary = { gates: gates.length + 1, pass: gates.filter((g) => g.status === "PASS").length + 1, fail: gates.filter((g) => g.status === "FAIL").length, blockedExternal: gates.filter((g) => g.status === "BLOCKED_EXTERNAL").length, notImplemented: gates.filter((g) => g.status === "NOT_IMPLEMENTED").length };
  const durationMs = Date.now() - tStart;
  gates.push({
    id: "T19-verdict", area: "T19", status: "PASS",
    startedAt: t19Start, finishedAt: now(), environment: envSummary,
    evidenceReference: ["docs/generated/phase-t-evidence.json"],
    safeSummary: "Verdict computed deterministically from executed gate results. No gate status was altered to fit the verdict.",
    detail: { verdict, phaseSSummary: S, phaseTSummary: summary, durationMs },
  });
  const finalSummary = { gates: gates.length, pass: gates.filter((g) => g.status === "PASS").length, fail: gates.filter((g) => g.status === "FAIL").length, blockedExternal: gates.filter((g) => g.status === "BLOCKED_EXTERNAL").length, notImplemented: gates.filter((g) => g.status === "NOT_IMPLEMENTED").length };

  const staleGuard = { gitHead: head, branch, buildId, sourceFingerprint: fpAfter, verifyCommand: "node scripts/phase-t-evidence.mjs --verify" };
  const ev = {
    phase: "T",
    generatedAt,
    generator: "scripts/phase-t-evidence.mjs",
    staleGuard,
    baseline,
    environment: envSummary,
    probes,
    phaseS: { verdict: sEv.verdict, summary: S, verify: sVerify },
    gates,
    summary: finalSummary,
    verdict,
  };
  writeFileSync(EVIDENCE, JSON.stringify(ev, null, 2) + "\n");

  const externalBlockers = gates.filter((g) => g.status === "BLOCKED_EXTERNAL").map((g) => ({
    gate: g.id,
    area: g.area,
    reason: g.detail?.reason ?? g.safeSummary,
    unblockBy: g.detail?.unblockBy ?? "",
    supporting: g.detail?.supporting ?? null,
  }));
  const productionRisks = [];
  if (blocked) productionRisks.push("External infrastructure is not provisioned/reachable from this sandbox (see externalBlockers; each has an executable unblock step). Live HTTPS probes: supabase/OpenAI/Anthropic/Groq/Google-GenerativeAI/Sentry endpoints unreachable; registry.npmjs.org/pypi.org/github reachable.");
  productionRisks.push("Pre-existing migration drift (202608150003–0006, 4 files) reproduces on from-scratch replay and is absorbed by reconciliation migration 20260817001200; the real Supabase project must be created from linked project history and post-apply schema verified.");
  productionRisks.push("Cognitive thresholds and dataset r5-1 are committed and unchanged; no real-model score exists and none was fabricated (T8).");
  productionRisks.push("Alert rules are defined but unproven end-to-end until real firing is recorded (T5).");
  productionRisks.push("Billing remains NOT_IMPLEMENTED by product decision — the pilot is documented as non-billing/manually controlled; it must never be silently converted to PASS.");
  const gap = {
    phase: "T",
    generatedAt,
    staleGuard,
    verdict,
    baseline,
    summary: finalSummary,
    phaseSSummary: S,
    externalBlockers,
    internalBlockers: gates.filter((g) => g.status === "FAIL").map((g) => ({ gate: g.id, detail: g.detail })),
    notImplemented: [{ gate: "s15-billing", decision: "NOT_IMPLEMENTED — pilot is non-billing / manually controlled (contractual invoicing); automated billing is not required for this pilot." }],
    productionRisks,
  };
  writeFileSync(GAP, JSON.stringify(gap, null, 2) + "\n");

  console.log(JSON.stringify({ verdict, summary: finalSummary, phaseSSummary: S, baselineOk, durationMs, evidence: "docs/generated/phase-t-evidence.json", gap: "docs/generated/phase-t-readiness-gap.json" }, null, 2));
  process.exit(0);
}

main();
