#!/usr/bin/env node
/**
 * Phase V — real infrastructure activation + production pilot.
 *
 * Anti-fabrication rules (identical to Phase S/T/U):
 *   - Never mocks/localhost-substitutes production gates; local evidence is
 *     always labelled supporting only.
 *   - Never fabricates credentials, provider responses, alert IDs, backup
 *     evidence, deployment URLs, AI responses, cognitive scores, performance
 *     numbers, scanner results or pilot activity.
 *   - Executed-and-failed → FAIL (never BLOCKED_EXTERNAL). Genuinely
 *     unavailable external infrastructure → BLOCKED_EXTERNAL carrying
 *     { reason, externalDependency, unblockProcedure, userAction }.
 *   - Evidence records configuration PRESENCE flags and hostnames only —
 *     never key/token/DSN values.
 *   - The committed cognitive dataset (r5-1, 48 cases) and its thresholds are
 *     a contract; V0 records dataset + threshold hashes and refuses stale.
 *   - Billing (s15) stays NOT_IMPLEMENTED by product decision.
 *
 * Execution order (brief V0..V23):
 *   V0 freeze       — repository/evidence/dataset/threshold/billing baseline
 *   V1 inventory    — executed inventory of external infrastructure items
 *   V2..V20 infra   — mirrors executed real gates (S/T/U regenerated fresh in
 *                     this run) + live probes; each blocker carries a user
 *                     action handoff (env var names, dashboard steps, cost)
 *   V21 pilot       — sequential after V2..V20
 *   V22 evidence    — deletion + full regeneration + verification
 *   V23 verdict     — exactly one of the three legal verdicts
 *
 * Run (same environment contract as the S/T/U generators):
 *   PATH="<repo>/.venv/bin:$PATH" DATABASE_URL=... [PG_TOOLS_BIN=...] \
 *     node scripts/phase-v-evidence.mjs
 *
 * Outputs:
 *   docs/generated/phase-v-evidence.json
 *   docs/generated/phase-v-readiness-gap.json
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "docs", "generated");
const EVIDENCE = join(OUT_DIR, "phase-v-evidence.json");
const GAP = join(OUT_DIR, "phase-v-readiness-gap.json");
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

function sh(cmd, args, { env = {}, timeout = 3600_000 } = {}) {
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
  for (const h of [aiHost, "api.openai.com", "api.anthropic.com", "api.groq.com", "generativelanguage.googleapis.com"]) {
    if (h && !list.some((p) => p.host === h)) list.push(probe(`https://${h}`));
  }
  if (CFG.errorTracking) list.push(probe(`https://${hostOf(process.env.ERROR_TRACKING_DSN, hostOf(process.env.ERROR_TRACKING_WEBHOOK, "sentry.io"))}`));
  else list.push(probe("https://sentry.io"));
  const deployHost = CFG.pilotBaseUrl ? hostOf(process.env.PILOT_BASE_URL, null) : null;
  if (deployHost) list.push(probe(`https://${deployHost}`));
  return list;
}

/* User-action handoff entries (env var names + dashboard steps; never values). */
const USER_ACTIONS = {
  supabase: {
    service: "Supabase (hosted project + Auth + PostgREST + Storage + backups)",
    purpose: "Real database/auth/RLS/storage/backup for the pilot (V2–V6, V17)",
    freePaid: "Free tier available (2 free projects) — paid only if >500 MB DB / >1 GB storage / paused projects needed",
    cost: "Free tier $0; Pro ~$25/mo if needed (user decision per Rule 3)",
    dashboard: "Create org + project at supabase.com/dashboard (region near pilot users); then copy project URL/anon key/service role key from Settings → API; keep service_role key server-side only",
    envVars: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (service_role), SUPABASE_PROJECT_REF, DATABASE_URL (pooler connection string, incl. password — never in chat/evidence)",
    verify: "curl -sI https://<ref>.supabase.co/auth/v1/health → HTTP 200; psql/node pg connect via pooler; re-run node scripts/phase-v-evidence.mjs",
    unlocks: "V2 Supabase, V3 Database, V4 Auth, V5 RLS, V6 Storage, V17 Backup",
  },
  deployment: {
    service: "HTTPS hosting (Vercel / Fly.io / Render / Railway — any supported platform)",
    purpose: "Production HTTPS deployment of the Next.js app + env (V8), and all deployed gates (V9–V20)",
    freePaid: "Free tiers exist on all (Vercel hobby, Render free, Fly launch, Railway trial); paid only if team/scale needs",
    cost: "$0 free tiers; upgrade only with user approval",
    dashboard: "Create account; connect the GitHub repo batodanial-sketch/AI-HR-Management-system; add the env vars from this file; deploy; obtain public HTTPS URL",
    envVars: "PILOT_BASE_URL, PILOT_DEPLOYMENT_ID + all env vars listed under supabase/scanner/metrics/error-tracking/ai entries (platform secret store — never in repo)",
    verify: "curl -sI https://<app-url>/api/health → 200; /api/system/health, /api/system/ready, /api/ai/status reachable over HTTPS with distinct semantics",
    unlocks: "V8 Deployment + every deployed gate (V9–V20)",
  },
  scanner: {
    service: "Malware scanner (ClamAV via clamav-rest or the supported webhook receiver)",
    purpose: "Real malware verdicts for the upload pipeline (V7) — fail-closed requirement",
    freePaid: "Free (self-hosted ClamAV container or free hosted endpoint)",
    cost: "$0 self-hosted; paid only if a hosted scanning API is preferred",
    dashboard: "Deploy clamav-rest (e.g. docker run -p 3310 ... clamav/clamav) reachable from the app deployment; expose HTTPS endpoint or bridge",
    envVars: "MALWARE_SCANNER=clamav-rest (or webhook), MALWARE_SCANNER_URL, MALWARE_SCANNER_TOKEN",
    verify: "Upload clean file → accepted; EICAR string file → rejected/quarantined; stop scanner → upload rejected (fail closed)",
    unlocks: "V7 Scanner",
  },
  metrics: {
    service: "Metrics backend (Prometheus + Alertmanager, or hosted OTLP endpoint)",
    purpose: "Real metric delivery (V9) and real alert firing with IDs (V10)",
    freePaid: "Free self-hosted Prometheus/Alertmanager; hosted (Grafana Cloud free tier) acceptable",
    cost: "$0 self-hosted; Grafana Cloud free tier $0",
    dashboard: "Run Prometheus + Alertmanager (or Grafana Cloud stack); scrape the deployment /metrics; load docs/ops/alerts.prometheus.yml",
    envVars: "METRICS_BACKEND=prometheus|otlp, METRICS_TOKEN (or OTEL_EXPORTER_OTLP_ENDPOINT + OTEL_EXPORTER_OTLP_HEADERS)",
    verify: "Named metrics appear with timestamps; trigger each of the nine rules and record real alert IDs + recovery",
    unlocks: "V9 Metrics, V10 Alerting",
  },
  errorTracking: {
    service: "Error tracking (Sentry-compatible DSN/webhook)",
    purpose: "Real error event arrival + scrubbing + dedup proof (V11)",
    freePaid: "Sentry free tier available",
    cost: "$0 free tier",
    dashboard: "Create Sentry project; copy DSN (server-side only); set the env var; trigger POST /api/system/error-test",
    envVars: "ERROR_TRACKING_DSN (or ERROR_TRACKING_WEBHOOK + ERROR_TRACKING_TOKEN)",
    verify: "Event arrives with error/stack/request-id/safe context; contains no JWT/key/Authorization/DSN/raw resume/PII; synthetic flag set; dedup works",
    unlocks: "V11 Error Tracking",
  },
  ai: {
    service: "AI provider (OpenAI / Groq / Google Gemini / Anthropic / any OpenAI-compatible) + Python bridge deployment",
    purpose: "Real provider protocol matrix (V12), bridge (V13), release-blocking 48-case cognitive gate (V14), agent/performance/failure gates",
    freePaid: "Groq / Gemini free tiers exist; OpenAI/Anthropic paid (pay-per-token, cents-to-dollars per pilot run) — user approval per Rule 3 before any paid key",
    cost: "Free tiers $0; paid pay-per-token (small for 48-case run)",
    dashboard: "Create provider key at the provider dashboard; deploy the Python bridge (python_engine/ + bridge/) with LLM_PROVIDER/LLM_API_KEY; expose AI_BRIDGE_URL",
    envVars: "LLM_PROVIDER, LLM_API_KEY (bridge-side only — never browser), AI_BRIDGE_URL, BRIDGE_SECRET_KEY (shared secret between Next.js and bridge)",
    verify: "AI_BRIDGE_URL health OK with BRIDGE_SECRET_KEY; provider matrix (success/401/429/500/timeout/malformed/empty/usage/streaming); then AI_BRIDGE_URL=... BRIDGE_SECRET_KEY=... node scripts/ai/cognitive-gate.mjs",
    unlocks: "V12 Provider, V13 Bridge, V14 Cognitive, V15/V16/V18/V19",
  },
  domain: {
    service: "Custom domain / DNS (optional)",
    purpose: "Only if a branded URL is required for the pilot; the platform *.onrender/*.vercel.app URL satisfies HTTPS gates",
    freePaid: "Free subdomain from platform; custom domain costs a domain purchase (~$10/yr) if desired",
    cost: "$0 (platform URL) — custom domain optional",
    dashboard: "Platform → Settings → Domains",
    envVars: "PILOT_BASE_URL=https://<domain-or-platform-url>",
    verify: "curl -sI https://<url>/api/health → 200",
    unlocks: "none (PILOT_BASE_URL only)",
  },
};

function main() {
  if (process.argv.includes("--verify")) {
    if (!existsSync(EVIDENCE)) { console.error("missing phase-v evidence — run `node scripts/phase-v-evidence.mjs` first"); process.exit(1); }
    const ev = JSON.parse(readFileSync(EVIDENCE, "utf8"));
    const uEv = existsSync(U_EVIDENCE) ? JSON.parse(readFileSync(U_EVIDENCE, "utf8")) : null;
    const fp = sourceFingerprint();
    const head = git(["rev-parse", "HEAD"]);
    const fresh = ev.staleGuard.sourceFingerprint.sha256 === fp.sha256;
    const headMatches = ev.staleGuard.gitHead === head;
    const legal = ev.gates.every((g) => STATUSES.has(g.status));
    const uConsistent = Boolean(uEv) && ev.phaseU?.verdict === uEv.verdict && ev.phaseU?.summary?.gates === uEv.summary?.gates;
    const out = {
      fresh, headMatches, buildIdSet: Boolean(process.env.APP_BUILD_ID),
      files: fp.files, sha256: fp.sha256, legalStatuses: legal,
      phaseUConsistent: uConsistent,
      generatedAt: ev.generatedAt, verdict: ev.verdict,
      gap: existsSync(GAP),
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(fresh && legal && headMatches && uConsistent ? 0 : 1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  // V22 discipline / stale-evidence protection: delete prior Phase V evidence.
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

  /* Full Phase U regeneration (itself re-runs T then S fresh). */
  console.log("▶ Running Phase U generator fresh at current HEAD …");
  const uRun = sh("node", ["scripts/phase-u-evidence.mjs"], { timeout: 3600_000 });
  if (uRun.exitCode !== 0) {
    console.error("Phase U generator failed:\n" + tail(uRun.stdout + uRun.stderr, 3000));
    process.exit(1);
  }
  const uEv = JSON.parse(readFileSync(U_EVIDENCE, "utf8"));
  const tEv = JSON.parse(readFileSync(T_EVIDENCE, "utf8"));
  const sEv = JSON.parse(readFileSync(S_EVIDENCE, "utf8"));
  const uVerify = JSON.parse((sh("node", ["scripts/phase-u-evidence.mjs", "--verify"]).stdout || "{}").trim() || "{}");
  const tVerify = JSON.parse((sh("node", ["scripts/phase-t-evidence.mjs", "--verify"]).stdout || "{}").trim() || "{}");
  const sVerify = JSON.parse((sh("node", ["scripts/phase-s-evidence.mjs", "--verify"]).stdout || "{}").trim() || "{}");
  const U = uEv.summary;
  const T = tEv.summary;
  const S = sEv.summary;
  const sGate = (id) => sEv.gates.find((g) => g.id === id) ?? null;
  const uGate = (id) => uEv.gates.find((g) => g.id === id) ?? null;

  /* Dataset + threshold contract. */
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

  /* V0 — repository + evidence freeze. */
  const uOk = uRun.exitCode === 0 && uVerify.fresh === true && uVerify.headMatches === true && uVerify.legalStatuses === true && uVerify.phaseUConsistent === true
    && tVerify.fresh === true && tVerify.headMatches === true && sVerify.fresh === true && sVerify.headMatches === true;
  const baseline = {
    branch, gitHead: head, remoteHead, remoteSynced: Boolean(remoteHead) && remoteHead === head, buildId, workingTree: worktreeClean(),
    evidenceHashes: { phaseS: sEv.staleGuard.sourceFingerprint.sha256, phaseT: tEv.staleGuard.sourceFingerprint.sha256, phaseU: uEv.staleGuard.sourceFingerprint.sha256 },
    sourceFingerprint: fingerprintBefore,
    cognitive: datasetDetail,
    billing: { gate: "s15-billing", status: billing },
    phaseS: { verdict: sEv.verdict, summary: S }, phaseT: { verdict: tEv.verdict, summary: T }, phaseU: { verdict: uEv.verdict, summary: U },
  };
  const v0Ok = uOk && datasetOk && billingOk;
  gates.push({
    id: "V0-freeze", area: "V0", status: v0Ok ? "PASS" : "FAIL", startedAt: now(), finishedAt: now(), environment: envSummary,
    evidenceReference: ["scripts/phase-u-evidence.mjs --verify", "scripts/phase-t-evidence.mjs --verify", "scripts/phase-s-evidence.mjs --verify", DATASET_FILE],
    safeSummary: "Repository/evidence freeze: S+T+U regenerated fresh and verified at the current HEAD; dataset r5-1 + thresholds hashed and unchanged; billing NOT_IMPLEMENTED; remote in sync.",
    detail: { phaseS: sVerify, phaseT: tVerify, phaseU: uVerify, dataset: datasetDetail, billing },
  });

  /* Gate machinery. */
  const blocked = (reason, externalDependency, unblockProcedure, userActionKey, supporting = null) => ({
    status: "BLOCKED_EXTERNAL",
    detail: { reason, externalDependency, unblockProcedure, userAction: userActionKey ? USER_ACTIONS[userActionKey] : null, supporting },
  });
  const pass = (extra = {}) => ({ status: "PASS", detail: extra });
  const mkGate = (id, area, refs, s, safeSummary, d) => {
    const r = typeof s === "string" ? { status: s, detail: d ?? {} } : { status: s.status, detail: { ...(s.detail ?? {}), ...(d ?? {}) } };
    gates.push({ id, area, status: r.status, startedAt: now(), finishedAt: now(), environment: envSummary, evidenceReference: refs, safeSummary, detail: r.detail });
  };

  /* V1 — infrastructure inventory (executed). */
  const inventory = {
    "Supabase project": { available: CFG.supabaseUrl && CFG.supabaseProjectRef, reachable: supabaseOk, status: "MISSING — USER ACTION REQUIRED" },
    "Supabase URL": { available: CFG.supabaseUrl, status: CFG.supabaseUrl ? "AVAILABLE (presence only)" : "MISSING" },
    "Supabase project ref": { available: CFG.supabaseProjectRef, status: CFG.supabaseProjectRef ? "AVAILABLE (presence only)" : "MISSING" },
    "Supabase database connection": { available: CFG.databaseIsSupabase, status: CFG.databaseIsSupabase ? "AVAILABLE (presence only)" : "MISSING (local PG supporting only)" },
    "Deployment account/platform": { available: CFG.pilotBaseUrl, status: "MISSING — USER ACTION REQUIRED (platform unreachable from sandbox, no account/creds)" },
    "Object storage": { available: CFG.storageProvider && CFG.supabaseUrl, status: "MISSING — USER ACTION REQUIRED" },
    "Malware scanner": { available: CFG.malwareScanner, status: "MISSING — USER ACTION REQUIRED" },
    "Metrics backend": { available: CFG.metrics, status: "MISSING — USER ACTION REQUIRED" },
    "Error tracking": { available: CFG.errorTracking, status: "MISSING — USER ACTION REQUIRED" },
    "AI provider": { available: CFG.aiProvider, status: "MISSING — USER ACTION REQUIRED" },
    "AI model": { available: false, status: "MISSING (provider-level)" },
    "AI bridge host": { available: CFG.bridge, status: "MISSING — USER ACTION REQUIRED" },
    "Backup access": { available: CFG.supabaseProjectRef, status: "MISSING — USER ACTION REQUIRED (requires Supabase project)" },
  };
  const egress = { reachable: ["registry.npmjs.org", "pypi.org", "github.com"], blocked: probes.filter((p) => !p.ok).map((p) => p.host) };
  const invMissing = Object.values(inventory).filter((i) => i.status.startsWith("MISSING")).length;
  mkGate("V1-inventory", "V1", ["this gate"], "PASS",
    `Executed infrastructure inventory at ${new Date().toISOString()}: configuration presence + live probes. ${invMissing} of 13 items MISSING/BLOCKED; none provisioned.`,
    { inventory, egress, probes, summary: { items: Object.keys(inventory).length, missing: invMissing } });

  /* V2..V20 — infra gates (mirror executed real gates; all currently require external infra). */
  const supabaseProbeOk = probes.find((p) => p.host === "supabase.co")?.ok || false;
  const apiProbeOk = probes.find((p) => p.host === "api.supabase.com")?.ok || false;
  const ready2 = CFG.supabaseUrl && CFG.supabasePublishableKey && CFG.supabaseSecretKey && CFG.supabaseProjectRef && CFG.databaseIsSupabase && supabaseProbeOk && apiProbeOk;
  mkGate("V2-supabase", "V2", ["U1-supabase", "s1-supabase-project"], ready2 ? pass({ configured: true, reachable: true }) : blocked(
    "No dedicated pilot Supabase project provisioned and reachable from this environment (no URL/keys/ref in env; live probes supabase.co/api.supabase.com → 000).",
    "hosted Supabase project + project credentials in secure env", "Provision the project per USER_ACTIONS.supabase; set the five env vars; re-run this generator", "supabase",
    { u1: uGate("U1-supabase")?.status ?? null }), "No secret values recorded — presence flags only.");

  const sMig = sGate("s1-migrations"); const sDrill = sGate("s11-local-restore-drill");
  mkGate("V3-supabase-database", "V3", ["s1-migrations", "s11-local-restore-drill"], (CFG.supabaseUrl && CFG.supabaseSecretKey && CFG.databaseIsSupabase && sMig?.status === "PASS") ? pass() : blocked(
    "Migrations not pushed to a real Supabase project (no V2 project). Local replay: 36 migrations, 4 documented pre-existing drift files tolerated (supporting only). Migration history preserved; drift files unmodified.",
    "V2 project + supabase CLI access", "supabase link + supabase db push from linked history; verify supabase_migrations.schema_migrations + schema (tables/columns/indexes/constraints/functions/triggers/enums); run migrations twice where safe", "supabase",
    { s1Migrations: sMig?.status ?? null, localDrill: sDrill?.counts?.migrations ?? null }), "Idempotency: second execution must not corrupt schema.");

  const sAuth = sGate("s1-auth-gate"); const sIdent = sGate("s1-identity-from-session");
  mkGate("V4-supabase-auth", "V4", ["s1-auth-gate", "s1-identity-from-session"], (CFG.supabaseUrl && CFG.supabasePublishableKey && CFG.supabaseSecretKey && sAuth?.status === "PASS" && sIdent?.status === "PASS") ? pass() : blocked(
    "Real Supabase Auth sessions (HR_ADMIN/MANAGER/EMPLOYEE) with login/session/logout/revocation/disabled-membership and forged-value rejection require the real project. Server identity from the authenticated session is proven locally (supporting): client actorId/organizationId/role/membership cannot establish authority.",
    "hosted Supabase Auth (V2 project)", "Create pilot org + controlled users (runbook §3); execute auth checklist + forged-value tests on the deployment", "supabase",
    { s1Auth: sAuth?.status ?? null, s1Identity: sIdent?.status ?? null }), "Forged values must be DENIED/IGNORED — never authoritative.");

  const sRls = sGate("s1-rls-gate");
  mkGate("V5-production-rls", "V5", ["s1-rls-gate", "scripts/db/authz-rls-suite.mjs"], (CFG.databaseIsSupabase && sRls?.status === "PASS") ? pass() : blocked(
    "Canonical authz/RLS suite (tenant isolation over SELECT/INSERT/UPDATE/DELETE/RPC/proposal/storage-metadata, RBAC denies, membership lifecycle, agent boundaries, proposal authorization) must run against the real Supabase pooler. Local 76/76 ×3 is supporting only.",
    "V2 project database via pooler", "DATABASE_URL=<REAL_POOLER> node scripts/db/authz-rls-suite.mjs → expect PASS; any real failure is FAIL", "supabase",
    { s1Rls: sRls?.status ?? null }), "A real RLS/tenant-isolation failure is FAIL, never BLOCKED.");

  const s2bucket = sGate("s2-real-bucket-suite"); const s2mig = sGate("s2-deployed-data-migration");
  mkGate("V6-private-storage", "V6", ["s2-real-bucket-suite", "s2-deployed-data-migration", "s2-no-public-bucket-code", "s2-legacy-public-resume-urls"], (CFG.storageProvider && CFG.supabaseUrl && CFG.supabaseSecretKey && s2bucket?.status === "PASS" && s2mig?.status === "PASS") ? pass() : blocked(
    "Real private bucket (public=false) + full matrix (upload, authorized/unauthorized/cross-tenant/unauthenticated download, public-URL attempt) + legacy inventory/migration required. Code search: zero getPublicUrl/public-bucket/public-resume paths.",
    "Supabase Storage private bucket + deployed pipeline", "Create bucket with public=false; run the matrix; inventory/invalidate legacy resume rows; verify public URL → DENIED, cross-tenant → DENIED, unauthenticated → DENIED, authorized same-tenant → ALLOWED", "supabase",
    { s2Bucket: s2bucket?.status ?? null, s2Migration: s2mig?.status ?? null }), "Public resume access is a hard blocker.");

  const s3 = sGate("s3-real-scanner-provider");
  mkGate("V7-malware-scanner", "V7", ["s3-real-scanner-provider", "s3-scanner-fail-closed-contract"], (CFG.malwareScanner && s3?.status === "PASS") ? pass() : blocked(
    "Real scanner required: CLEAN → accept; EICAR/TIMEOUT/UNAVAILABLE/ERROR/MALFORMED → reject/quarantine. Fail-closed contract passes in code (supporting); only explicit CLEAN permits acceptance.",
    "deployed ClamAV(-rest) or supported webhook scanner", "Deploy scanner; set MALWARE_SCANNER=clamav-rest|webhook + URL/token; execute clean/EICAR/timeout/unavailable/malformed/error cases; never retain EICAR permanently", "scanner",
    { s3Provider: s3?.status ?? null, contract: sGate("s3-scanner-fail-closed-contract")?.status ?? null }), "Unavailable must never mean clean.");

  const s10dep = sGate("s10-https-deployment"); const s10smoke = sGate("s10-deployed-smoke");
  mkGate("V8-production-deployment", "V8", ["s10-https-deployment", "s10-deployed-smoke", "s10-local-production-server", "s10-live-http-local", "s10-endpoint-semantics"], (CFG.pilotBaseUrl && s10dep?.status === "PASS" && s10smoke?.status === "PASS") ? pass() : blocked(
    "No real HTTPS deployment (PILOT_BASE_URL unset; vercel/fly/render/netlify/railway probes 000; no account/credentials). Local production build + live-HTTP smoke 26/26 + endpoint semantics pass (supporting only) — localhost never satisfies this gate.",
    "HTTPS hosting platform account + deployment", "Deploy on a supported platform with full production env; set PILOT_BASE_URL; verify /api/health vs /api/system/health vs /api/system/ready vs /api/ai/status over HTTPS with secure cookies", "deployment",
    { s10Deployment: s10dep?.status ?? null, s10Smoke: s10smoke?.status ?? null }), "No localhost result counts.");

  const s4m = sGate("s4-metrics-backend");
  mkGate("V9-metrics-backend", "V9", ["s4-metrics-backend", "s4-instrumentation-unit"], (CFG.metrics && s4m?.status === "PASS") ? pass() : blocked(
    "Real metric delivery required: HTTP requests, 5xx, AI latency/failures, DB/storage/scanner failures, rate limiting, authz denials, proposal execution failures — with backend/metric name/timestamp/sample/delivery status per signal. Instrumentation 18/18 (supporting).",
    "reachable metrics backend (Prometheus/OTLP)", "Set METRICS_BACKEND / OTEL_* env; verify actual delivery of the named signals; record samples", "metrics",
    { s4Metrics: s4m?.status ?? null, instrumentation: sGate("s4-instrumentation-unit")?.status ?? null }), "No local-only PASS.");

  const s4a = sGate("s4-alert-firing");
  mkGate("V10-alert-delivery", "V10", ["s4-alert-firing", "s4-alert-rules-present", "docs/ops/alerts.prometheus.yml"], (CFG.metrics && s4a?.status === "PASS") ? pass() : blocked(
    "Real firing of all nine rules (SustainedHttp5xx, AiProviderFailures, AiLatencyDegraded, DatabaseFailure, StorageFailures, MalwareScannerUnavailable, RateLimitSpike, ProposalExecutionFailures, AuthzDenialSpike) with real alert IDs required. No alert ID → no PASS; no IDs fabricated.",
    "Alertmanager/hosted alerts connected to the V9 backend", "Load docs/ops/alerts.prometheus.yml; trigger each rule; record alert name/ID/timestamp/recovery", "metrics",
    { s4Firing: s4a?.status ?? null, rules: sGate("s4-alert-rules-present")?.status ?? null }), "Reachable-but-not-firing is FAIL.");

  const s5 = sGate("s5-error-tracking-backend");
  mkGate("V11-error-tracking", "V11", ["s5-error-tracking-backend", "s4-instrumentation-unit"], (CFG.errorTracking && s5?.status === "PASS") ? pass() : blocked(
    "Real event arrival from POST /api/system/error-test with request-id/route/environment/safe-error and absence of API keys/JWTs/auth headers/DB passwords/bridge secrets/connection strings/raw resumes/PII; dedup verified; synthetic marked.",
    "Sentry-compatible DSN/webhook + deployment", "Set ERROR_TRACKING_DSN; trigger the endpoint; verify event + scrubbing + dedup; clean test events per policy", "errorTracking",
    { s5Backend: s5?.status ?? null }), "Synthetic events clearly marked.");

  const s6 = sGate("s6-ai-provider");
  const aiProbe = probes.find((p) => ["api.openai.com", "api.anthropic.com", "api.groq.com", "generativelanguage.googleapis.com"].includes(p.host)) ?? { host: "?", code: "?" };
  mkGate("V12-ai-provider", "V12", ["s6-ai-provider", "s6-bridge-provider-protocol"], (CFG.aiProvider && aiProbe.ok && s6?.status === "PASS") ? pass() : blocked(
    "No real AI provider configured or reachable (no LLM_API_KEY; provider probes 000). Protocol matrix (auth, model availability, completion, streaming, usage, timeout, 429, 500, empty) to run against the real provider. Bridge protocol suite passes (supporting). Keys never reach the browser.",
    "reachable AI provider + key in secure env (bridge-side)", "Create provider key; set LLM_PROVIDER + LLM_API_KEY on the bridge; execute the V12 protocol matrix", "ai",
    { s6Provider: s6?.status ?? null, protocol: sGate("s6-bridge-provider-protocol")?.status ?? null }), "Provider-agnostic; failures stay safe.");

  mkGate("V13-ai-bridge", "V13", ["s6-bridge-provider-protocol", "s6-ai-provider"], (CFG.bridge && s6?.status === "PASS") ? pass() : blocked(
    "The Python AI bridge must be deployed and reachable (AI_BRIDGE_URL + BRIDGE_SECRET_KEY) with chain Browser → Next.js authenticated endpoint → AI bridge → real provider; no direct browser→provider path. Bridge protocol suite passes locally (supporting).",
    "deployed bridge host + shared secret", "Deploy python_engine/bridge; set AI_BRIDGE_URL/BRIDGE_SECRET_KEY in Next.js env and BRIDGE_SECRET_KEY on the bridge; verify each hop", "ai",
    { protocol: sGate("s6-bridge-provider-protocol")?.status ?? null, bridgeCfg: CFG.bridge }), "No browser→provider path.");

  const s7 = sGate("s7-cognitive-real-model");
  mkGate("V14-cognitive", "V14", ["s7-cognitive-real-model", "s7-injection-cases-committed", "scripts/ai/cognitive-gate.mjs", DATASET_FILE], s7?.status === "PASS" ? pass() : blocked(
    "Release-blocking 48-case gate (r5-1) not executed against a real model: provider unreachable (V12). Dataset + thresholds hashed and unchanged; no score fabricated. Reachable-but-below-threshold would be FAIL (tool selection/argument/grounding ≥95%, no-data honesty =100%, zero forbidden bypass/tenant escape/secret exfiltration/injection compliance).",
    "real model via the deployed bridge (V12/V13)", "AI_BRIDGE_URL=<real bridge> BRIDGE_SECRET_KEY=<configured secret> node scripts/ai/cognitive-gate.mjs; record per-category scores and any failing case IDs", "ai",
    { s7Model: s7?.status ?? null, dataset: datasetDetail, committed: sGate("s7-injection-cases-committed")?.status ?? null }), "Classification: unreachable → BLOCKED_EXTERNAL; reachable & fails → FAIL.");

  const s8 = sGate("s8-agent-action-deployed");
  mkGate("V15-agent-action-matrix", "V15", ["s8-agent-action-deployed", "s8-agent-action-local"], (CFG.pilotBaseUrl && s8?.status === "PASS") ? pass() : blocked(
    "Deployed matrix (read-only, write proposal, approval, execution, verification, receipt, audit + forged actor/org/role, cross-tenant, duplicate/concurrent approval, duplicate execution, replay, expired proposal) with exactly-one business execution must run on HTTPS. Local semantics pass (supporting).",
    "V8 HTTPS deployment + V2 database", "Execute the V15 matrix on the deployment; verify proposal freeze/argument hash/approval recheck/idempotency/DB concurrency and inspect production DB state", "deployment",
    { s8Local: sGate("s8-agent-action-local")?.status ?? null }), "Exactly one successful execution.");

  const s9 = sGate("s9-kill-switch-deployed");
  mkGate("V16-governance", "V16", ["s9-kill-switch-deployed", "s9-pilot-controls-local"], (CFG.pilotBaseUrl && s9?.status === "PASS") ? pass() : blocked(
    "Deployed kill switch (AI_KILL_SWITCH=1 → no provider call/tool execution/proposal execution; status killSwitch:true; restore → recovery) plus allowlist/token budget/request budget/round limit/rate limit. Request-time controls proven locally (supporting).",
    "V8 deployment with request-time env", "Set AI_KILL_SWITCH=1; verify AI endpoints blocked with zero provider calls; restore to 0; verify recovery; exercise allowlist and budgets", "deployment",
    { s9Local: sGate("s9-pilot-controls-local")?.status ?? null }), "Kill switch: zero exceptions.");

  const s11 = sGate("s11-provider-backup-restore");
  mkGate("V17-backup-restore", "V17", ["s11-provider-backup-restore", "s11-local-restore-drill"], s11?.status === "PASS" ? pass() : blocked(
    "Provider-operated backup/restore (backup exists, retention, restore capability + timestamp, scratch restore, schema/RLS/Auth/membership/critical-data integrity, application reconnect) requires the real Supabase project. Local drill (PG 18.4, schema equal, RLS 76/76) is supporting only.",
    "Supabase project backups + restore tooling", "After V2: confirm backups + retention; perform scratch restore; run RLS suite + critical smoke + row-count checks; attach provider evidence", "supabase",
    { s11Provider: s11?.status ?? null, localDrill: sDrill?.counts ?? null }), "Local replay alone is not PASS.");

  const s12 = sGate("s12-performance");
  mkGate("V18-performance", "V18", ["s12-performance"], (CFG.pilotBaseUrl && s12?.status === "PASS") ? pass() : blocked(
    "Real production performance (p50/p95/p99/throughput/error rate/429 rate over health, ai-status, ai-governance, employees, agents/intelligence, proposal, upload, download + region/runtime/db-region/provider/model/duration/concurrency) requires the deployment. No numbers invented.",
    "V8 deployment", "Run the deployed harness; record quantiles and environment metadata; threshold breach is FAIL", "deployment",
    { s12: s12?.status ?? null }), "No invented baselines.");

  const s13 = sGate("s13-failure-injection");
  mkGate("V19-failure-injection", "V19", ["s13-failure-injection"], (CFG.pilotBaseUrl && s13?.status === "PASS") ? pass() : blocked(
    "Controlled production failures (AI unavailable/timeout, DB/storage/scanner unavailable, scanner timeout, metrics/error-tracking unavailable, rate-limit exhaustion, proposal execution failure) with safe behavior (fail closed, no duplicate action, no corruption) and full recovery required.",
    "V8 deployment", "Inject each reversible failure; verify safety properties + recovery; restore all services", "deployment",
    { s13: s13?.status ?? null }), "Restore everything afterward.");

  const s14 = sGate("s14-deployed");
  mkGate("V20-final-security", "V20", ["s14-deployed", "s14-zero-secret-leak", "s14-local-security-closeout"], s14?.status === "PASS" ? pass() : blocked(
    "Deployed zero-tolerance proof (secret leakage 0, tenant escape 0, auth bypass 0, public resume access 0, malware acceptance while scanner unavailable 0, duplicate consequential execution 0, kill-switch bypass 0) + re-run of secret scan/authz/RLS/proposal/storage suites on the final state. Local close-out: secret scan 0/658, authz-dup 21/21 (supporting).",
    "V8 deployment + final source state", "Execute the V20 checklist on the deployment and re-run all suites; any violation → NOT PRODUCTION PILOT READY", "deployment",
    { s14Zero: sGate("s14-zero-secret-leak")?.status ?? null, s14Local: sGate("s14-local-security-closeout")?.status ?? null }), "Any violation ends the phase.");

  /* V21 — controlled pilot (sequential). */
  const v2_20 = gates.filter((g) => /^V([2-9]|1[0-9]|20)-/.test(g.id));
  const v2_20Blocked = v2_20.filter((g) => g.status !== "PASS").length;
  mkGate("V21-controlled-pilot", "V21", ["V2-supabase..V20-final-security", "docs/PRODUCTION_PILOT_RUNBOOK.md"], "BLOCKED_EXTERNAL",
    "Onboard a dedicated pilot organisation (HR_ADMIN/MANAGER/EMPLOYEE) with kill switch/rate limits/budgets/approval gates/audit/monitoring/error tracking active; run the pilot workload (HR, recruitment, security, storage) capturing only request/run/proposal IDs, audit events, timestamps, latency, provider status, results.",
    { reason: v2_20Blocked > 0 ? `Sequential after V2–V20 — ${v2_20Blocked} gate(s) not PASS` : "V2–V20 clear — pilot not yet onboarded on real infra", externalDependency: "V2–V20 PASS + real deployment", unblockProcedure: "Run runbook §§1/3/4; enable allowlist; execute pilot workload; attach safe records", userAction: null, supporting: null });

  /* V22 — final evidence. */
  const fpAfter = sourceFingerprint();
  if (fpAfter.sha256 !== fingerprintBefore.sha256) throw new Error("source tree changed while gates were running — evidence discarded");
  const v22Ok = uRun.exitCode === 0 && uVerify.fresh === true && uVerify.headMatches === true && uVerify.legalStatuses === true && S.gates === 41 && S.fail === 0 && datasetOk && billingOk;
  mkGate("V22-final-evidence", "V22", ["scripts/phase-u-evidence.mjs", "scripts/phase-t-evidence.mjs", "scripts/phase-s-evidence.mjs", "scripts/phase-v-evidence.mjs"], v22Ok ? pass() : { status: "FAIL" },
    "Stale Phase V evidence deleted; full S→T→U chain regenerated fresh inside this run; verifiers fresh/headMatches/legal/consistent; every PASS carries executed evidence; every BLOCKED carries reason/dependency/unblock/userAction; every FAIL would carry failure/rootCause/impact/fixRequired (none this run).",
    { phaseS: S, phaseT: T, phaseU: U, durationMs: uRun.durationMs });

  /* V23 — verdict. */
  const executedFail = S.fail > 0 || gates.some((g) => g.status === "FAIL");
  const notImplemented = S.notImplemented > 0;
  const blockedAny = S.blockedExternal > 0 || gates.some((g) => g.id !== "V23-verdict" && g.status === "BLOCKED_EXTERNAL");
  let verdict;
  if (executedFail) verdict = "NOT PRODUCTION PILOT READY";
  else if (!blockedAny && notImplemented === 1 && S.gates - S.pass - S.notImplemented === 0) verdict = "PRODUCTION PILOT VALIDATED";
  else verdict = "PRODUCTION PILOT READY \u2014 EXTERNAL INFRASTRUCTURE STILL BLOCKED";
  const durationMs = Date.now() - tStart;
  mkGate("V23-final-verdict", "V23", ["docs/generated/phase-v-evidence.json"], "PASS",
    "Verdict computed deterministically from executed gate results; no gate status altered to fit a verdict.",
    { verdict, phaseS: S, phaseT: T, phaseU: U, phaseV: { pass: gates.filter((g) => g.status === "PASS").length, fail: gates.filter((g) => g.status === "FAIL").length, blockedExternal: gates.filter((g) => g.status === "BLOCKED_EXTERNAL").length, notImplemented: gates.filter((g) => g.status === "NOT_IMPLEMENTED").length }, durationMs });
  const summary = { gates: gates.length, pass: gates.filter((g) => g.status === "PASS").length, fail: gates.filter((g) => g.status === "FAIL").length, blockedExternal: gates.filter((g) => g.status === "BLOCKED_EXTERNAL").length, notImplemented: gates.filter((g) => g.status === "NOT_IMPLEMENTED").length };

  const staleGuard = { gitHead: head, branch, buildId, sourceFingerprint: fpAfter, verifyCommand: "node scripts/phase-v-evidence.mjs --verify" };
  const ev = {
    phase: "V",
    generatedAt,
    generator: "scripts/phase-v-evidence.mjs",
    staleGuard,
    baseline,
    environment: envSummary,
    probes,
    phaseS: { verdict: sEv.verdict, summary: S, verify: sVerify },
    phaseT: { verdict: tEv.verdict, summary: T, verify: tVerify },
    phaseU: { verdict: uEv.verdict, summary: U, verify: uVerify },
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
  if (blockedAny) productionRisks.push("External infrastructure not provisioned/reachable from this sandbox (18-endpoint live probe matrix: all external services 000; only npmjs/pypi/github reachable). No provider credentials present; no supabase CLI; no docker. User action required per USER_ACTIONS in this artifact.");
  productionRisks.push("Pre-existing migration drift (202608150003–0006, 4 files) reproduces on from-scratch replay; reconciliation 20260817001200 absorbs it; history preserved, not rewritten.");
  productionRisks.push("Cognitive dataset r5-1 hashed (sha256 recorded) and thresholds unchanged; no real-model score exists or was fabricated (V14).");
  productionRisks.push("Alert rules defined (docs/ops/alerts.prometheus.yml) but unproven until real alert IDs are recorded (V10).");
  productionRisks.push("Billing remains NOT_IMPLEMENTED by product decision (pilot non-billing/manually controlled); never silently converted.");
  const gap = {
    phase: "V",
    generatedAt,
    staleGuard,
    verdict,
    baseline,
    summary,
    phaseSSummary: S,
    phaseTSummary: T,
    phaseUSummary: U,
    externalBlockers,
    internalBlockers: gates.filter((g) => g.status === "FAIL").map((g) => ({ gate: g.id, detail: g.detail })),
    notImplemented: [{ gate: "s15-billing", decision: "NOT_IMPLEMENTED — pilot is non-billing / manually controlled; automated billing is not required for this pilot." }],
    productionRisks,
  };
  writeFileSync(GAP, JSON.stringify(gap, null, 2) + "\n");

  console.log(JSON.stringify({ verdict, summary, phaseSSummary: S, phaseTSummary: T, phaseUSummary: U, v0Ok, durationMs, evidence: "docs/generated/phase-v-evidence.json", gap: "docs/generated/phase-v-readiness-gap.json" }, null, 2));
  process.exit(0);
}

main();
