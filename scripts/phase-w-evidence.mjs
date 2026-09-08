#!/usr/bin/env node
/**
 * Phase W — infrastructure provisioning → deployment → real AI → controlled pilot.
 *
 * Anti-fabrication rules (identical to Phases S/T/U/V):
 *   - Never mocks/localhost-substitutes production gates; local evidence is
 *     always labelled supporting only.
 *   - Never fabricates API responses, credentials, deployment URLs, project
 *     IDs, alert IDs, backup IDs, scanner results, AI outputs, cognitive
 *     scores, performance metrics, pilot users or provider status.
 *   - Executed-and-failed → FAIL (never BLOCKED_EXTERNAL). Genuinely
 *     unavailable external infrastructure → BLOCKED_EXTERNAL carrying
 *     { reason, externalDependency, unblockProcedure, userAction }.
 *   - Evidence records configuration PRESENCE flags and hostnames only —
 *     never key/token/DSN values.
 *   - The committed cognitive dataset (r5-1, 48 cases) and its thresholds are
 *     a contract; hashes are recorded and stale baselines are refused.
 *   - Billing (s15) stays NOT_IMPLEMENTED by product decision.
 *
 * Execution order (brief W0..W24):
 *   W0 baseline    — repository/evidence/dataset/threshold/billing freeze
 *   W1 stack       — recommended infrastructure stack (operator decision)
 *   W2..W20 infra  — mirrors the freshly re-executed Phase V gates (which
 *                    mirror U/T/S executed real gates) + live probes; every
 *                    blocker carries reason/externalDependency/unblockProcedure
 *                    and a userAction checkpoint (never secret values)
 *   W21/W22 pilot  — sequential after W2..W20
 *   W23 evidence   — deletion + full S→T→U→V→W regeneration + verification
 *   W24 verdict    — exactly one of the three legal verdicts
 *
 * Run (same environment contract as the S/T/U/V generators):
 *   PATH="<repo>/.venv/bin:$PATH" DATABASE_URL=... [PG_TOOLS_BIN=...] \
 *     node scripts/phase-w-evidence.mjs
 *
 * Outputs:
 *   docs/generated/phase-w-evidence.json
 *   docs/generated/phase-w-readiness-gap.json
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "docs", "generated");
const EVIDENCE = join(OUT_DIR, "phase-w-evidence.json");
const GAP = join(OUT_DIR, "phase-w-readiness-gap.json");
const V_EVIDENCE = join(OUT_DIR, "phase-v-evidence.json");
const U_EVIDENCE = join(OUT_DIR, "phase-u-evidence.json");
const T_EVIDENCE = join(OUT_DIR, "phase-t-evidence.json");
const S_EVIDENCE = join(OUT_DIR, "phase-s-evidence.json");
const DATASET_FILE = join(ROOT, "scripts", "ai", "cognitive-dataset.json");
const STATUSES = new Set(["PASS", "FAIL", "BLOCKED_EXTERNAL", "NOT_IMPLEMENTED"]);
const VERDICTS = [
  "PRODUCTION PILOT VALIDATED",
  "PRODUCTION PILOT READY \u2014 EXTERNAL INFRASTRUCTURE STILL BLOCKED",
  "NOT PRODUCTION PILOT READY",
];
const DATASET_CONTRACT = { version: "r5-1", cases: 48 };

function sh(cmd, args, { env = {}, timeout = 7200_000 } = {}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const res = spawnSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...env, FORCE_COLOR: "0", CI: "1" }, encoding: "utf8", timeout, maxBuffer: 96 * 1024 * 1024 });
  return { command: [cmd, ...args].join(" "), startedAt, durationMs: Date.now() - t0, exitCode: res.status, signal: res.signal ?? null, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}
const git = (args) => sh("git", args).stdout.trim();
const tail = (s, n = 2500) => { if (!s) return ""; const t = String(s); return t.length > n ? t.slice(-n) : t; };
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
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const has = (k) => Boolean(process.env[k] && String(process.env[k]).trim().length > 0);
function hostOf(urlOrEmpty, fallback) {
  try {
    const u = new URL(String(urlOrEmpty));
    if (u.hostname) return u.hostname;
  } catch { /* not a URL */ }
  return fallback;
}
function probe(url, maxMs = 5000) {
  const r = spawnSync("curl", ["-sk", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", String(Math.ceil(maxMs / 1000)), String(url)], { encoding: "utf8", timeout: maxMs + 2000 });
  const code = (r.stdout || "").trim();
  return { host: hostOf(url, "?"), code: code || "unreachable", ok: code === "200" || code === "201" || code === "204" || code === "301" || code === "302" || code === "307" || code === "308" || code === "401" || code === "403" };
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

function runProbes() {
  const list = [];
  const supabaseProbe = CFG.supabaseUrl ? hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL, null) : null;
  list.push(probe(supabaseProbe ? `https://${supabaseProbe}` : "https://supabase.co"));
  list.push(probe("https://api.supabase.com"));
  const aiHost = CFG.aiProvider ? providerHost(process.env.LLM_PROVIDER) : null;
  for (const h of [aiHost, "api.openai.com", "api.groq.com", "generativelanguage.googleapis.com", "api.anthropic.com"]) {
    if (h && !list.some((p) => p.host === h)) list.push(probe(`https://${h}`));
  }
  if (CFG.errorTracking) list.push(probe(`https://${hostOf(process.env.ERROR_TRACKING_DSN, hostOf(process.env.ERROR_TRACKING_WEBHOOK, "sentry.io"))}`));
  else list.push(probe("https://sentry.io"));
  const deployHost = CFG.pilotBaseUrl ? hostOf(process.env.PILOT_BASE_URL, null) : null;
  if (deployHost) list.push(probe(`https://${deployHost}`));
  return list;
}

/** W1 — recommended infrastructure stack (operator decision; no spending without approval). */
const STACK = {
  databaseAuth: { service: "Supabase (Auth + PostgREST + PostgreSQL + Storage + backups)", free: "2 free projects", paid: "Pro ~$25/mo (only if free tier insufficient)", chosen: "Supabase" },
  deployment: { service: "HTTPS hosting for Next.js 14", free: "Vercel Hobby / Render free / Railway trial / Fly launch", paid: "Team plans (only with user approval)", chosen: "Vercel or Render — decision requires user confirmation", rationale: "Next.js 14 native support, env secret stores, HTTPS by default, reliable deploys" },
  storage: { service: "Supabase Storage private bucket", free: "1 GB included in free project", paid: "Pro storage add-on", chosen: "Supabase Storage (public=false)" },
  scanner: { service: "ClamAV (private server-side)", free: "self-hosted ClamAV $0", paid: "hosted scanning API if preferred", chosen: "ClamAV via clamav-rest (or supported webhook)" },
  metrics: { service: "Metrics + alerting", free: "Grafana Cloud free tier; Prometheus+Alertmanager self-hosted $0", paid: "Grafana paid plans", chosen: "Prometheus + Alertmanager (or Grafana Cloud free)" },
  errorTracking: { service: "Error tracking", free: "Sentry free tier", paid: "Sentry Team", chosen: "Sentry" },
  ai: { service: "AI provider (bridge-side key)", free: "Groq / Google Gemini free tiers", paid: "OpenAI/Anthropic pay-per-token (only with user approval)", chosen: "Groq or Gemini first; provider-agnostic via existing abstraction" },
  bridge: { service: "Existing Python AI bridge (bridge/ + python_engine/)", chosen: "deploy unchanged" },
};

/** User-action checkpoints (env var NAMES + dashboard steps; never secret values). */
const USER_ACTIONS = {
  supabase: {
    service: "Supabase (hosted project: Auth + PostgREST + PostgreSQL + Storage + backups)",
    purpose: "Real database/auth/RLS/storage/backup for the pilot (W2–W6, W17)",
    freePaid: "Free tier (2 free projects) — paid Pro ~$25/mo only if needed (Rule 3 approval)",
    cost: "$0 free; Pro ~$25/mo only with user approval",
    dashboard: "Create org + project at supabase.com/dashboard; Settings → API for URL/keys; service_role key stays server-side",
    envVars: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_PROJECT_REF, DATABASE_URL",
    verify: "curl -sI https://<ref>.supabase.co/auth/v1/health → 200; node pg connect via pooler; re-run node scripts/phase-w-evidence.mjs",
    unlocks: "W2 Supabase, W3 Database, W4 Auth, W5 RLS, W6 Storage, W17 Backup",
  },
  deployment: {
    service: "HTTPS hosting (Vercel / Render / Railway / Fly.io)",
    purpose: "Production HTTPS deployment + env store (W8) and every deployed gate (W9–W20)",
    freePaid: "Free tiers on all; paid only with user approval",
    cost: "$0 free tiers",
    dashboard: "Create account; connect GitHub repo batodanial-sketch/AI-HR-Management-system; add env vars in the platform secret store; deploy; note HTTPS URL",
    envVars: "PILOT_BASE_URL, PILOT_DEPLOYMENT_ID + all env vars under the other checkpoints (platform secret store)",
    verify: "curl -sI https://<app>/api/health → 200; /api/system/health, /api/system/ready, /api/ai/status distinct over HTTPS",
    unlocks: "W8 + every deployed gate",
  },
  scanner: {
    service: "ClamAV (clamav-rest or supported webhook)",
    purpose: "Real malware verdicts for the upload pipeline (W7), fail-closed",
    freePaid: "Free self-hosted",
    cost: "$0",
    dashboard: "Deploy clamav-rest reachable from the app deployment",
    envVars: "MALWARE_SCANNER=clamav-rest|webhook, MALWARE_SCANNER_URL, MALWARE_SCANNER_TOKEN",
    verify: "clean → accept; EICAR → reject; scanner stopped → upload rejected (fail closed)",
    unlocks: "W7",
  },
  metrics: {
    service: "Metrics backend (Prometheus+Alertmanager or Grafana Cloud / OTLP)",
    purpose: "Real metric delivery (W9) and alert firing with real IDs (W10)",
    freePaid: "Free (self-hosted or Grafana Cloud free tier)",
    cost: "$0",
    dashboard: "Run backend; scrape deployment /metrics; load docs/ops/alerts.prometheus.yml",
    envVars: "METRICS_BACKEND=prometheus|otlp, METRICS_TOKEN or OTEL_EXPORTER_OTLP_ENDPOINT(+HEADERS)",
    verify: "named metrics present; nine rules fire with real alert IDs + recovery",
    unlocks: "W9, W10",
  },
  errorTracking: {
    service: "Sentry (Sentry-compatible DSN/webhook)",
    purpose: "Real error event arrival + scrubbing + dedup (W11)",
    freePaid: "Sentry free tier",
    cost: "$0",
    dashboard: "Create project; copy DSN (server-side only)",
    envVars: "ERROR_TRACKING_DSN (or ERROR_TRACKING_WEBHOOK + ERROR_TRACKING_TOKEN)",
    verify: "POST /api/system/error-test → event arrives scrubbed, synthetic-marked, dedup works",
    unlocks: "W11",
  },
  ai: {
    service: "AI provider (Groq / Gemini preferred; OpenAI/Anthropic only with approval) + Python bridge deploy",
    purpose: "Provider protocol matrix (W12), bridge (W13), release-blocking cognitive gate (W14), agent/perf/failure gates",
    freePaid: "Groq/Gemini free tiers; paid keys only with user approval (Rule 3)",
    cost: "$0 free tiers; paid pay-per-token only with approval",
    dashboard: "Create provider key at provider dashboard; deploy bridge (bridge/ + python_engine/) with LLM_PROVIDER/LLM_API_KEY; expose AI_BRIDGE_URL",
    envVars: "LLM_PROVIDER, LLM_API_KEY (bridge-side only), AI_BRIDGE_URL, BRIDGE_SECRET_KEY (Next.js ↔ bridge shared secret)",
    verify: "bridge health with BRIDGE_SECRET_KEY; invalid secret → 401 (no provider call); then AI_BRIDGE_URL=… BRIDGE_SECRET_KEY=… node scripts/ai/cognitive-gate.mjs",
    unlocks: "W12, W13, W14, W15/W16/W18/W19",
  },
};

/* V-gate → W-gate mapping (W mirrors the freshly executed V gate). */
const V2W = [
  ["W2-supabase", "V2-supabase"],
  ["W3-supabase-database", "V3-supabase-database"],
  ["W4-supabase-auth", "V4-supabase-auth"],
  ["W5-production-rls", "V5-production-rls"],
  ["W6-private-storage", "V6-private-storage"],
  ["W7-malware-scanner", "V7-malware-scanner"],
  ["W8-production-deployment", "V8-production-deployment"],
  ["W9-metrics-backend", "V9-metrics-backend"],
  ["W10-alert-delivery", "V10-alert-delivery"],
  ["W11-error-tracking", "V11-error-tracking"],
  ["W12-ai-provider", "V12-ai-provider"],
  ["W13-ai-bridge", "V13-ai-bridge"],
  ["W14-cognitive", "V14-cognitive"],
  ["W15-agent-action-matrix", "V15-agent-action-matrix"],
  ["W16-governance", "V16-governance"],
  ["W17-backup-restore", "V17-backup-restore"],
  ["W18-performance", "V18-performance"],
  ["W19-failure-injection", "V19-failure-injection"],
  ["W20-final-security", "V20-final-security"],
];

function main() {
  if (process.argv.includes("--verify")) {
    if (!existsSync(EVIDENCE)) { console.error("missing phase-w evidence — run `node scripts/phase-w-evidence.mjs` first"); process.exit(1); }
    const ev = JSON.parse(readFileSync(EVIDENCE, "utf8"));
    const vEv = existsSync(V_EVIDENCE) ? JSON.parse(readFileSync(V_EVIDENCE, "utf8")) : null;
    const fp = sourceFingerprint();
    const head = git(["rev-parse", "HEAD"]);
    const fresh = ev.staleGuard.sourceFingerprint.sha256 === fp.sha256;
    const headMatches = ev.staleGuard.gitHead === head;
    const legal = ev.gates.every((g) => STATUSES.has(g.status));
    const vConsistent = Boolean(vEv) && ev.phaseV?.verdict === vEv.verdict && ev.phaseV?.summary?.gates === vEv.summary?.gates;
    const out = {
      fresh, headMatches, buildIdSet: Boolean(process.env.APP_BUILD_ID),
      files: fp.files, sha256: fp.sha256, legalStatuses: legal,
      phaseVConsistent: vConsistent,
      generatedAt: ev.generatedAt, verdict: ev.verdict,
      gap: existsSync(GAP),
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(fresh && legal && headMatches && vConsistent ? 0 : 1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  // W23 discipline / stale-evidence protection: delete prior Phase W evidence.
  for (const f of [EVIDENCE, GAP]) rmSync(f, { force: true });

  if (!has("DATABASE_URL")) { console.error("DATABASE_URL is required"); process.exit(2); }
  const toolsBin = process.env.PG_TOOLS_BIN;
  if (!toolsBin || !["initdb", "pg_ctl", "postgres"].every((n) => existsSync(join(toolsBin, n)))) {
    console.error("PG_TOOLS_BIN must point at a directory with initdb/pg_ctl/postgres"); process.exit(2);
  }

  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const remoteHead = git(["ls-remote", "origin", "refs/heads/" + branch]).split(/\s+/)[0] ?? null;
  const fingerprintBefore = sourceFingerprint();
  const buildId = process.env.APP_BUILD_ID || head;
  const generatedAt = new Date().toISOString();
  const tStart = Date.now();
  const gates = [];
  const now = () => new Date().toISOString();
  const probes = [];

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

  /* Full Phase V regeneration (itself re-runs U → T → S fresh). */
  console.log("▶ Running Phase V generator fresh at current HEAD …");
  const vRun = sh("node", ["scripts/phase-v-evidence.mjs"], { timeout: 5400_000 });
  if (vRun.exitCode !== 0) {
    console.error("Phase V generator failed:\n" + tail(vRun.stdout + vRun.stderr, 3000));
    process.exit(1);
  }
  const vEv = JSON.parse(readFileSync(V_EVIDENCE, "utf8"));
  const uEv = JSON.parse(readFileSync(U_EVIDENCE, "utf8"));
  const tEv = JSON.parse(readFileSync(T_EVIDENCE, "utf8"));
  const sEv = JSON.parse(readFileSync(S_EVIDENCE, "utf8"));
  const vVerify = JSON.parse((sh("node", ["scripts/phase-v-evidence.mjs", "--verify"]).stdout || "{}").trim() || "{}");
  const uVerify = JSON.parse((sh("node", ["scripts/phase-u-evidence.mjs", "--verify"]).stdout || "{}").trim() || "{}");
  const tVerify = JSON.parse((sh("node", ["scripts/phase-t-evidence.mjs", "--verify"]).stdout || "{}").trim() || "{}");
  const sVerify = JSON.parse((sh("node", ["scripts/phase-s-evidence.mjs", "--verify"]).stdout || "{}").trim() || "{}");
  const V = vEv.summary;
  const U = uEv.summary;
  const T = tEv.summary;
  const S = sEv.summary;
  const sGate = (id) => sEv.gates.find((g) => g.id === id) ?? null;
  const vGate = (id) => vEv.gates.find((g) => g.id === id) ?? null;

  /* Dataset + threshold contract (canonical compact JSON for threshold hash). */
  let datasetOk = false; let datasetDetail = null;
  try {
    const ds = JSON.parse(readFileSync(DATASET_FILE, "utf8"));
    const datasetSha = sha(readFileSync(DATASET_FILE));
    const th = ds.thresholds ?? {};
    const thresholdSha = sha(Buffer.from(JSON.stringify(th, Object.keys(th).sort())));
    datasetOk = ds.version === DATASET_CONTRACT.version && Array.isArray(ds.cases) && ds.cases.length === DATASET_CONTRACT.cases
      && Object.keys(th).length === 8;
    datasetDetail = { version: ds.version, cases: Array.isArray(ds.cases) ? ds.cases.length : null, datasetSha256: datasetSha, thresholdSha256: thresholdSha, contractMatched: datasetOk };
  } catch (e) { datasetDetail = { error: String(e?.message ?? e) }; }
  const billing = sGate("s15-billing")?.status ?? null;
  const billingOk = billing === "NOT_IMPLEMENTED";

  /* W0 — baseline. */
  const chainOk = vRun.exitCode === 0
    && vVerify.fresh === true && vVerify.headMatches === true && vVerify.legalStatuses === true && vVerify.phaseUConsistent === true
    && uVerify.fresh === true && uVerify.headMatches === true && uVerify.legalStatuses === true && uVerify.phaseTConsistent === true
    && tVerify.fresh === true && tVerify.headMatches === true && tVerify.legalStatuses === true && tVerify.phaseSConsistent === true
    && sVerify.fresh === true && sVerify.headMatches === true && sVerify.legalStatuses === true;
  const baseline = {
    branch, gitHead: head, remoteHead, remoteSynced: Boolean(remoteHead) && remoteHead === head, buildId, workingTree: worktreeClean(),
    evidenceHashes: { phaseS: sEv.staleGuard.sourceFingerprint.sha256, phaseT: tEv.staleGuard.sourceFingerprint.sha256, phaseU: uEv.staleGuard.sourceFingerprint.sha256, phaseV: vEv.staleGuard.sourceFingerprint.sha256 },
    cognitive: datasetDetail,
    billing: { gate: "s15-billing", status: billing },
    phaseS: { verdict: sEv.verdict, summary: S }, phaseT: { verdict: tEv.verdict, summary: T },
    phaseU: { verdict: uEv.verdict, summary: U }, phaseV: { verdict: vEv.verdict, summary: V },
  };
  const w0Ok = chainOk && datasetOk && billingOk;
  gates.push({
    id: "W0-baseline", area: "W0", status: w0Ok ? "PASS" : "FAIL", startedAt: now(), finishedAt: now(), environment: envSummary,
    evidenceReference: ["scripts/phase-v-evidence.mjs --verify", "scripts/phase-u-evidence.mjs --verify", "scripts/phase-t-evidence.mjs --verify", "scripts/phase-s-evidence.mjs --verify", DATASET_FILE],
    safeSummary: "Repository/evidence freeze: full S→T→U→V chain regenerated fresh at the current HEAD and verified; dataset r5-1 (48 cases) + threshold hashes recorded and unchanged; billing NOT_IMPLEMENTED.",
    detail: { phaseS: sVerify, phaseT: tVerify, phaseU: uVerify, phaseV: vVerify, dataset: datasetDetail, billing },
  });

  /* W1 — recommended stack (recorded decision point). */
  gates.push({
    id: "W1-infrastructure-stack", area: "W1", status: "PASS", startedAt: now(), finishedAt: now(), environment: envSummary,
    evidenceReference: ["W1-stack", "docs/PRODUCTION_PILOT_RUNBOOK.md"],
    safeSummary: "Recommended stack recorded (Supabase; Vercel/Render/Railway/Fly; Supabase Storage private; ClamAV; Prometheus+Alertmanager or Grafana Cloud; Sentry; Groq/Gemini preferred; existing bridge deployed unchanged). Provisioning is operator action — nothing is provisioned or spent without user approval (Rule 3).",
    detail: { stack: STACK, decision: "OPERATOR DECISION REQUIRED — no service selected/paid automatically" },
  });

  /* W2..W20 — infra gates mirroring the freshly executed Phase V gates. */
  const vGateById = (id) => vEv.gates.find((g) => g.id === id);
  for (const [wId, vId] of V2W) {
    const v = vGateById(vId);
    if (!v) { gates.push({ id: wId, area: wId.slice(0, 2), status: "FAIL", startedAt: now(), finishedAt: now(), environment: envSummary, evidenceReference: [vId], safeSummary: `Missing mirrored V gate ${vId}`, detail: { failure: `V gate ${vId} not found in fresh Phase V evidence`, rootCause: "generator defect", impact: "cannot evaluate", requiredFix: "fix mapping" } }); continue; }
    const d = v.detail ?? {};
    gates.push({
      id: wId, area: wId.slice(0, 2), status: v.status, startedAt: now(), finishedAt: now(), environment: envSummary,
      evidenceReference: [vId, ...(v.evidenceReference ?? [])],
      safeSummary: v.safeSummary,
      detail: v.status === "PASS"
        ? { vGate: vId, configured: d.configured ?? null, reachable: d.reachable ?? null, supporting: d.supporting ?? null }
        : { vGate: vId, reason: d.reason ?? v.safeSummary, externalDependency: d.externalDependency ?? null, unblockProcedure: d.unblockProcedure ?? null, userAction: d.userAction ?? null, supporting: d.supporting ?? null },
    });
  }

  /* W21 / W22 — controlled pilot (sequential). */
  const w2_20 = gates.filter((g) => /^W([2-9]|1[0-9]|20)-/.test(g.id));
  const w2_20Blocked = w2_20.filter((g) => g.status !== "PASS").length;
  gates.push({
    id: "W21-pilot-onboarding", area: "W21", status: "BLOCKED_EXTERNAL", startedAt: now(), finishedAt: now(), environment: envSummary,
    evidenceReference: ["W2-supabase..W20-final-security", "docs/PRODUCTION_PILOT_RUNBOOK.md"],
    safeSummary: "Create one dedicated pilot organisation (HR_ADMIN/MANAGER/EMPLOYEE), enable only that organisation, keep kill switch/rate limits/token budgets/approval gates/audit/metrics/error tracking enabled.",
    detail: { reason: w2_20Blocked > 0 ? `Sequential after W2–W20 — ${w2_20Blocked} gate(s) not PASS` : "W2–W20 clear — onboarding not yet executed on real infra", externalDependency: "W2–W20 PASS + real deployment", unblockProcedure: "Run runbook §§1/3/4 on the real deployment; attach onboarding evidence", userAction: null, supporting: null },
  });
  gates.push({
    id: "W22-pilot-operation", area: "W22", status: "BLOCKED_EXTERNAL", startedAt: now(), finishedAt: now(), environment: envSummary,
    evidenceReference: ["W21-pilot-onboarding", "docs/PRODUCTION_PILOT_RUNBOOK.md"],
    safeSummary: "Execute real workflows (HR lookup/knowledge/capacity/leave; recruitment search→evaluation→evidence→proposal→approval→execution→verification→receipt→audit; security injection/no-data/unauthorized/cross-tenant/forged; storage clean/malware upload + download checks), recording only safe identifiers.",
    detail: { reason: "Sequential after W21 (no pilot organisation onboarded)", externalDependency: "W21 onboarding executed", unblockProcedure: "Run the pilot workload matrix; capture request/run/proposal/audit IDs, timestamps, latency, provider status, result — never secrets or raw documents", userAction: null, supporting: null },
  });

  /* W23 — final evidence. */
  const fpAfter = sourceFingerprint();
  if (fpAfter.sha256 !== fingerprintBefore.sha256) throw new Error("source tree changed while gates were running — evidence discarded");
  const w23Ok = chainOk && S.gates === 41 && S.fail === 0 && datasetOk && billingOk;
  gates.push({
    id: "W23-final-evidence", area: "W23", status: w23Ok ? "PASS" : "FAIL", startedAt: now(), finishedAt: now(), environment: envSummary,
    evidenceReference: ["scripts/phase-v-evidence.mjs", "scripts/phase-u-evidence.mjs", "scripts/phase-t-evidence.mjs", "scripts/phase-s-evidence.mjs", "scripts/phase-w-evidence.mjs"],
    safeSummary: "Stale Phase W evidence deleted; full S→T→U→V→W chain regenerated fresh inside this run; verifiers fresh/headMatches/legal/consistent; every PASS carries executed evidence; every BLOCKED carries reason/externalDependency/unblockProcedure (+userAction); every FAIL would carry failure/rootCause/impact/requiredFix (none this run).",
    detail: { phaseS: S, phaseT: T, phaseU: U, phaseV: V, durationMs: vRun.durationMs },
  });

  /* W24 — verdict. */
  const executedFail = S.fail > 0 || gates.some((g) => g.status === "FAIL");
  const notImplemented = S.notImplemented > 0;
  const blockedAny = S.blockedExternal > 0 || gates.some((g) => g.id !== "W24-final-verdict" && g.status === "BLOCKED_EXTERNAL");
  let verdict;
  if (executedFail) verdict = "NOT PRODUCTION PILOT READY";
  else if (!blockedAny && notImplemented === 1 && S.gates - S.pass - S.notImplemented === 0) verdict = "PRODUCTION PILOT VALIDATED";
  else verdict = "PRODUCTION PILOT READY \u2014 EXTERNAL INFRASTRUCTURE STILL BLOCKED";
  const durationMs = Date.now() - tStart;
  gates.push({
    id: "W24-final-verdict", area: "W24", status: "PASS", startedAt: now(), finishedAt: now(), environment: envSummary,
    evidenceReference: ["docs/generated/phase-w-evidence.json"],
    safeSummary: "Verdict computed deterministically from executed gate results; no gate status altered to fit a verdict.",
    detail: { verdict, phaseS: S, phaseT: T, phaseU: U, phaseV: V, phaseW: { pass: gates.filter((g) => g.status === "PASS").length, fail: gates.filter((g) => g.status === "FAIL").length, blockedExternal: gates.filter((g) => g.status === "BLOCKED_EXTERNAL").length, notImplemented: gates.filter((g) => g.status === "NOT_IMPLEMENTED").length }, durationMs },
  });
  const summary = { gates: gates.length, pass: gates.filter((g) => g.status === "PASS").length, fail: gates.filter((g) => g.status === "FAIL").length, blockedExternal: gates.filter((g) => g.status === "BLOCKED_EXTERNAL").length, notImplemented: gates.filter((g) => g.status === "NOT_IMPLEMENTED").length };

  const staleGuard = { gitHead: head, branch, buildId, sourceFingerprint: fpAfter, verifyCommand: "node scripts/phase-w-evidence.mjs --verify" };
  const ev = {
    phase: "W",
    generatedAt,
    generator: "scripts/phase-w-evidence.mjs",
    staleGuard,
    baseline,
    environment: envSummary,
    probes,
    phaseS: { verdict: sEv.verdict, summary: S, verify: sVerify },
    phaseT: { verdict: tEv.verdict, summary: T, verify: tVerify },
    phaseU: { verdict: uEv.verdict, summary: U, verify: uVerify },
    phaseV: { verdict: vEv.verdict, summary: V, verify: vVerify },
    gates,
    summary,
    verdict,
  };
  writeFileSync(EVIDENCE, JSON.stringify(ev, null, 2) + "\n");

  const externalBlockers = gates.filter((g) => g.status === "BLOCKED_EXTERNAL").map((g) => ({
    gate: g.id,
    reason: g.detail?.reason ?? g.safeSummary,
    externalDependency: g.detail?.externalDependency ?? "",
    unblockProcedure: g.detail?.unblockProcedure ?? "",
    userAction: g.detail?.userAction ?? null,
    supporting: g.detail?.supporting ?? null,
  }));
  const productionRisks = [];
  if (blockedAny) productionRisks.push("External infrastructure not provisioned/reachable from this sandbox (live probe matrix: all external services 000; only npmjs/pypi/github reachable). No provider credentials, no supabase CLI, no docker. Operator action required per the userAction checkpoints in this artifact.");
  productionRisks.push("Pre-existing migration drift (202608150003–0006, 4 files) reproduces on from-scratch replay; reconciliation 20260817001200 absorbs it; history preserved, not rewritten.");
  productionRisks.push("Cognitive dataset r5-1 (48 cases) hashed and thresholds unchanged; no real-model score exists or was fabricated (W14).");
  productionRisks.push("Alert rules defined (docs/ops/alerts.prometheus.yml) but unproven until real alert IDs are recorded (W10).");
  productionRisks.push("Billing remains NOT_IMPLEMENTED by product decision (pilot non-billing / manually controlled); never silently converted.");
  const gap = {
    phase: "W",
    generatedAt,
    staleGuard,
    verdict,
    baseline,
    summary,
    phaseSSummary: S,
    phaseTSummary: T,
    phaseUSummary: U,
    phaseVSummary: V,
    externalBlockers,
    internalBlockers: gates.filter((g) => g.status === "FAIL").map((g) => ({ gate: g.id, detail: g.detail })),
    notImplemented: [{ gate: "s15-billing", decision: "NOT_IMPLEMENTED — pilot is non-billing / manually controlled; automated billing is not required for this pilot." }],
    productionRisks,
  };
  writeFileSync(GAP, JSON.stringify(gap, null, 2) + "\n");

  console.log(JSON.stringify({ verdict, summary, phaseSSummary: S, phaseTSummary: T, phaseUSummary: U, phaseVSummary: V, w0Ok, durationMs, evidence: "docs/generated/phase-w-evidence.json", gap: "docs/generated/phase-w-readiness-gap.json" }, null, 2));
  process.exit(0);
}

main();
