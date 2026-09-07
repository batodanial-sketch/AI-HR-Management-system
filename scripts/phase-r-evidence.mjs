#!/usr/bin/env node
/**
 * Phase R — production launch validation evidence generator.
 *
 * Deletes prior Phase R evidence, re-runs every gate FRESH, records exact
 * counts/timestamps/build identity, validates required keys and writes:
 *
 *   docs/generated/phase-r-evidence.json
 *   docs/generated/phase-r-readiness-gap.json
 *
 * Statuses are exactly PASS | FAIL | BLOCKED_EXTERNAL | NOT_IMPLEMENTED.
 * BLOCKED_EXTERNAL is never converted to PASS. Verdict is exactly one of:
 *   PRODUCTION PILOT READY
 *   PRODUCTION PILOT READY — EXTERNAL INFRASTRUCTURE BLOCKED
 *   NOT PRODUCTION PILOT READY
 *
 * External gates read their inputs from the environment only:
 *   DATABASE_URL (real PostgreSQL / Supabase), PILOT_BASE_URL (+ cookies),
 *   AI_BRIDGE_URL + BRIDGE_SECRET_KEY (+ provider on the bridge),
 *   SUPABASE_PROJECT_REF (identity only, never a key).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "docs", "generated");
const EVIDENCE = join(OUT_DIR, "phase-r-evidence.json");
const GAP = join(OUT_DIR, "phase-r-readiness-gap.json");
const PG_URL = process.env.DATABASE_URL ?? "";
const STATUSES = new Set(["PASS", "FAIL", "BLOCKED_EXTERNAL", "NOT_IMPLEMENTED"]);

function sh(cmd, args, { env = {}, timeout = 900_000 } = {}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const res = spawnSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...env, FORCE_COLOR: "0", CI: "1" }, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  return { command: [cmd, ...args].join(" "), startedAt, durationMs: Date.now() - t0, exitCode: res.status, signal: res.signal ?? null, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}
const git = (args) => sh("git", args).stdout.trim();
const tail = (s, n = 3000) => (s.length > n ? s.slice(-n) : s);
const lastJson = (s) => {
  const text = s.trim();
  // Whole output is JSON (possibly pretty-printed)?
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  // Last single-line JSON object?
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      /* keep looking */
    }
  }
  // First "{" to end.
  try {
    return JSON.parse(text.slice(text.indexOf("{")));
  } catch {
    return null;
  }
};

function sourceFingerprint() {
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard"]).split("\n").filter((f) => f && !f.startsWith("docs/generated/")).sort();
  const h = createHash("sha256");
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue;
    h.update(f).update("\0").update(readFileSync(join(ROOT, f))).update("\0");
  }
  return { files: files.length, sha256: h.digest("hex") };
}

const gates = [];
function gate(id, area, run) {
  process.stderr.write(`▶ ${id}\n`);
  let out;
  try {
    out = run();
  } catch (error) {
    out = { status: "FAIL", detail: { error: String(error?.message ?? error) } };
  }
  if (!STATUSES.has(out.status)) throw new Error(`gate ${id} produced illegal status ${out.status}`);
  const entry = { id, area, ...out, recordedAt: new Date().toISOString() };
  gates.push(entry);
  process.stderr.write(`  ${entry.status}\n`);
  return entry;
}
const blockedExt = (reason, unblockBy) => ({ status: "BLOCKED_EXTERNAL", detail: { reason, unblockBy } });

function main() {
  if (process.argv.includes("--verify")) return verify();
  mkdirSync(OUT_DIR, { recursive: true });
  // Stale-evidence protection: remove prior Phase R evidence before running.
  for (const f of [EVIDENCE, GAP, join(OUT_DIR, "phase-r-cognitive.json"), join(OUT_DIR, "phase-r-deployed.json")]) rmSync(f, { force: true });

  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const fingerprintBefore = sourceFingerprint();
  const buildId = process.env.APP_BUILD_ID || head;

  /* ── Build / static gates ─────────────────────────────────────────────── */
  gate("typescript", "build", () => {
    const r = sh("npx", ["tsc", "--noEmit", "--pretty", "false"]);
    return { status: r.exitCode === 0 ? "PASS" : "FAIL", counts: { errors: (r.stdout.match(/error TS\d+/g) ?? []).length }, log: tail(r.stdout + r.stderr, 1500) };
  });
  gate("eslint", "build", () => {
    const r = sh("npx", ["next", "lint", "--max-warnings", "0"]);
    const out = r.stdout + r.stderr;
    const clean = /No ESLint warnings or errors/.test(out);
    const m = out.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
    return { status: r.exitCode === 0 && (clean || (m && m[2] === "0" && m[3] === "0")) ? "PASS" : "FAIL", counts: { errors: clean ? 0 : m ? Number(m[2]) : null, warnings: clean ? 0 : m ? Number(m[3]) : null }, log: tail(out, 800) };
  });
  gate("jest", "unit", () => {
    const r = sh("npx", ["jest", "--json", "--silent"]);
    const j = lastJson(r.stdout);
    return { status: j && j.success ? "PASS" : "FAIL", counts: j ? { suites: j.numTotalTestSuites, tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests } : null, suites: j ? Object.fromEntries(j.testResults.map((t) => [t.name.replace(ROOT + "/", ""), { passed: t.assertionResults.filter((a) => a.status === "passed").length, failed: t.assertionResults.filter((a) => a.status === "failed").length }])) : null, log: tail(r.stderr, 1500) };
  });
  gate("pytest", "unit", () => {
    const r = sh("python3", ["-m", "pytest", "-q", "-p", "no:cacheprovider"]);
    const m = r.stdout.match(/(\d+) passed/);
    const f = r.stdout.match(/(\d+) failed/);
    return { status: r.exitCode === 0 ? "PASS" : "FAIL", counts: { passed: m ? Number(m[1]) : 0, failed: f ? Number(f[1]) : 0 }, log: tail(r.stdout, 1000) };
  });
  gate("next-build", "build", () => {
    sh("rm", ["-rf", ".next"]);
    const r = sh("npx", ["next", "build"], { timeout: 1_500_000, env: { APP_BUILD_ID: buildId } });
    const out = r.stdout + r.stderr;
    return { status: r.exitCode === 0 ? "PASS" : "FAIL", counts: { exitCode: r.exitCode, routes: (out.match(/^[├└┌│]\s+[○ƒ●λ]\s+\//gm) ?? []).length }, buildId, log: tail(out, 1200) };
  });

  /* ── R1 authorization ─────────────────────────────────────────────────── */
  gate("r1-authz-duplicate-check", "R1", () => {
    const r = sh("node", ["scripts/authz-duplicate-check.mjs"]);
    const j = lastJson(r.stdout);
    return { status: r.exitCode === 0 ? "PASS" : "FAIL", counts: j ? { total: j.total, passed: j.passed, failed: j.failed, filesScanned: j.filesScanned } : null };
  });

  /* ── R2 database (real PostgreSQL required) ───────────────────────────── */
  const pgProbe = PG_URL ? sh("node", ["-e", `const pg=require("pg");const c=new pg.Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query("select version() v, current_database() d, (select count(*) from pg_extension) ext")).then(r=>{console.log(JSON.stringify(r.rows[0]));return c.end()}).catch(e=>{console.error(e.message);process.exit(1)})`]) : null;
  const pgInfo = pgProbe && pgProbe.exitCode === 0 ? lastJson(pgProbe.stdout) : null;
  const isSupabase = /supabase\.(co|com|net)|pooler\.supabase/.test(PG_URL) || Boolean(process.env.SUPABASE_PROJECT_REF);
  const dbIdentity = pgInfo ? { version: pgInfo.v, database: pgInfo.d, kind: isSupabase ? "supabase" : "postgresql (non-Supabase)", host: PG_URL.replace(/^.*@/, "").replace(/\/.*$/, "").replace(/:\d+$/, (m) => m) } : null;

  gate("r2-migrations-clean-db", "R2", () => {
    if (!pgInfo) return blockedExt("no reachable DATABASE_URL", "point DATABASE_URL at a fresh Supabase project (or its branch) and re-run");
    if (!isSupabase) {
      const r = sh("node", ["scripts/db/local-pg.mjs", "reset", "--tolerant"], { env: { DATABASE_URL: PG_URL } });
      const j = lastJson(r.stdout);
      const failures = j?.failures ?? [];
      const pre = failures.filter((f) => /20260815000[3-6]/.test(f.file ?? ""));
      return { status: "BLOCKED_EXTERNAL", detail: { reason: "R2 requires a real Supabase project; this run used a plain PostgreSQL instance — result recorded as supporting evidence only, not as R2 PASS", unblockBy: "supabase db push against the pilot project, then re-run", dbIdentity }, supporting: { applied: j?.applied ?? null, phaseRMigrationsClean: !failures.some((f) => /2026090[67]0001/.test(f.file ?? "")), filesWithFailures: failures.length, preexistingDriftFiles: pre.length, failures } };
    }
    const r = sh("node", ["scripts/db/local-pg.mjs", "migrate"], { env: { DATABASE_URL: PG_URL } });
    const j = lastJson(r.stdout);
    return { status: r.exitCode === 0 && (j?.failures?.length ?? 0) === 0 ? "PASS" : "FAIL", counts: { applied: j?.applied ?? null, failures: j?.failures?.length ?? null }, dbIdentity };
  });
  gate("r2-migration-idempotency", "R2", () => {
    if (!pgInfo) return blockedExt("no reachable DATABASE_URL", "as above");
    const a = sh("node", ["scripts/db/local-pg.mjs", "schema-hash"], { env: { DATABASE_URL: PG_URL } });
    const r = sh("node", ["scripts/db/local-pg.mjs", isSupabase ? "migrate" : "migrate", "--tolerant"], { env: { DATABASE_URL: PG_URL } });
    const b = sh("node", ["scripts/db/local-pg.mjs", "schema-hash"], { env: { DATABASE_URL: PG_URL } });
    const ha = lastJson(a.stdout)?.hash ?? a.stdout.trim();
    const hb = lastJson(b.stdout)?.hash ?? b.stdout.trim();
    const same = ha && ha === hb;
    return { status: isSupabase ? (same ? "PASS" : "FAIL") : "BLOCKED_EXTERNAL", detail: isSupabase ? undefined : { reason: "measured on non-Supabase PostgreSQL", unblockBy: "run against the Supabase project" }, supporting: { schemaHashBefore: ha, schemaHashAfter: hb, unchangedOnRerun: same, rerunExit: r.exitCode } };
  });
  gate("r2-rls-lifecycle-concurrency", "R2", () => {
    if (!pgInfo) return blockedExt("no reachable DATABASE_URL", "as above");
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      const r = sh("node", ["scripts/db/authz-rls-suite.mjs"], { env: { DATABASE_URL: PG_URL } });
      const j = lastJson(r.stdout);
      runs.push({ exitCode: r.exitCode, total: j?.total ?? null, passed: j?.passed ?? null, failed: j?.failed ?? null, sections: j?.sections ?? null, failures: (j?.results ?? []).filter((x) => !x.ok).map((x) => `[${x.section}] ${x.name}`) });
    }
    const ok = runs.every((x) => x.exitCode === 0 && x.failed === 0);
    if (!ok) return { status: "FAIL", counts: runs[0], runs };
    return isSupabase ? { status: "PASS", counts: runs[0], repeatedRuns: 3, dbIdentity } : { status: "BLOCKED_EXTERNAL", detail: { reason: "suite passed 3/3 on non-Supabase PostgreSQL; the brief requires real Supabase (auth.uid() via real JWTs, storage schema, extensions)", unblockBy: "DATABASE_URL=<supabase pooler url> node scripts/db/authz-rls-suite.mjs" }, supporting: { counts: runs[0], repeatedRuns: 3, allPassed: true, dbIdentity } };
  });
  gate("r2-supabase-auth-flows", "R2", () => blockedExt("login/logout/refresh/expired/invalid-session flows need the deployed app + Supabase Auth", "scripts/phase-r/deployed-gate.mjs covers unauthenticated/invalid/expired/logout; login+refresh via tests/e2e with PILOT credentials"));

  /* ── R3 storage ───────────────────────────────────────────────────────── */
  gate("r3-file-validation-and-pipeline-unit", "R3", () => {
    const r = sh("npx", ["jest", "--json", "--silent", "tests/unit/storagePipeline.test.ts"]);
    const j = lastJson(r.stdout);
    return { status: j && j.success ? "PASS" : "FAIL", counts: j ? { tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests } : null, note: "Covers: valid PDF/DOCX/PNG, oversized, bad MIME, extension mismatch, malformed, empty, suspicious filename, path traversal, tenant key scoping, scanner unavailable/timeout/error ≠ clean, quarantine→reject on infection, cross-tenant delete refused." };
  });
  gate("r3-real-bucket-scanner", "R3", () => blockedExt("no object storage, malware scanner or egress in this environment", "deploy with STORAGE_PROVIDER=supabase + MALWARE_SCANNER=clamav-rest and run scripts/phase-r/deployed-gate.mjs (EICAR + clean PDF + cross-tenant + unauthorized download/delete)"));
  gate("r3-no-public-urls", "R3", () => {
    const r = sh("bash", ["-lc", "git grep -n 'getPublicUrl\\|public: true' -- app lib components || true"]);
    const hits = r.stdout.trim().split("\n").filter(Boolean);
    return { status: hits.length === 0 ? "PASS" : "FAIL", counts: { hits: hits.length }, hits };
  });

  /* ── R4 observability ─────────────────────────────────────────────────── */
  gate("r4-instrumentation-unit", "R4", () => {
    const r = sh("npx", ["jest", "--json", "--silent", "tests/unit/observability.test.ts"]);
    const j = lastJson(r.stdout);
    return { status: j && j.success ? "PASS" : "FAIL", counts: j ? { tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests } : null, note: "Scrubbing (JWT/keys/DSN/email/DB URLs), bounded label cardinality, no identifiers in labels, dedup, correlation id, Prometheus exposition." };
  });
  gate("r4-metrics-backend-error-tracking-alerts", "R4", () => blockedExt("no metrics backend, error-tracking SaaS or alert manager reachable; instrumentation alone is not alerting", "configure METRICS_BACKEND/ERROR_TRACKING_DSN, load docs/ops/alerts.prometheus.yml, trigger POST /api/system/error-test and one synthetic condition per alert; attach screenshots/alert ids"));

  /* ── R5 cognitive ─────────────────────────────────────────────────────── */
  gate("r5-cognitive-gate", "R5", () => {
    const ds = JSON.parse(readFileSync(join(ROOT, "scripts", "ai", "cognitive-dataset.json"), "utf8"));
    const r = sh("node", ["scripts/ai/cognitive-gate.mjs"], { timeout: 1_800_000 });
    const j = lastJson(r.stdout);
    const base = { dataset: { version: ds.version, cases: ds.cases.length, thresholds: ds.thresholds, categories: Object.fromEntries(ds.cases.reduce((m, c) => m.set(c.category, (m.get(c.category) ?? 0) + 1), new Map())) } };
    if (r.exitCode === 3 || j?.status === "BLOCKED_EXTERNAL") return { ...blockedExt(j?.detail ?? j?.reason ?? "provider unreachable", "run bridge with LLM_PROVIDER/LLM_API_KEY, then AI_BRIDGE_URL=... BRIDGE_SECRET_KEY=... node scripts/ai/cognitive-gate.mjs"), ...base };
    return { status: r.exitCode === 0 ? "PASS" : "FAIL", ...base, scores: j?.scores ?? null, checks: j?.checks ?? null, report: "docs/generated/phase-r-cognitive.json" };
  });
  gate("r5-ai-security-unit-and-bridge", "R5", () => {
    const r = sh("npx", ["jest", "--json", "--silent", "tests/unit/aiAuthority.test.ts", "tests/unit/proposalLifecycle.test.ts"]);
    const j = lastJson(r.stdout);
    const py = sh("python3", ["-m", "pytest", "-q", "-p", "no:cacheprovider", "python_engine/tests/test_bridge_copilot_authority.py"]);
    const pm = py.stdout.match(/(\d+) passed/);
    return { status: j?.success && py.exitCode === 0 ? "PASS" : "FAIL", counts: { jest: j ? { tests: j.numTotalTests, passed: j.numPassedTests } : null, pytest: { passed: pm ? Number(pm[1]) : 0, exit: py.exitCode } } };
  });

  /* ── R6 deployment / pilot / failure injection / performance ──────────── */
  gate("r6-deployed-gate", "R6", () => {
    const r = sh("node", ["scripts/phase-r/deployed-gate.mjs"], { timeout: 1_800_000 });
    const j = lastJson(r.stdout);
    const rep = existsSync(join(OUT_DIR, "phase-r-deployed.json")) ? JSON.parse(readFileSync(join(OUT_DIR, "phase-r-deployed.json"), "utf8")) : null;
    if (r.exitCode === 3 && !rep?.checks?.length) return blockedExt(rep?.reason ?? "no deployment", "deploy to HTTPS host, set PILOT_BASE_URL + pilot session cookies (never stored), run scripts/phase-r/deployed-gate.mjs");
    return { status: r.exitCode === 0 ? "PASS" : r.exitCode === 3 ? "BLOCKED_EXTERNAL" : "FAIL", counts: rep?.counts ?? j?.counts ?? null, deployment: rep ? { host: rep.baseUrl, buildId: rep.buildId } : null, report: "docs/generated/phase-r-deployed.json" };
  });
  gate("r6-pilot-safety-controls", "R6", () => {
    const r = sh("npx", ["jest", "--json", "--silent", "-t", "pilot|proposal|kill", "tests/unit/proposalLifecycle.test.ts"]);
    const j = lastJson(r.stdout);
    const files = ["lib/pilot/controls.ts", "app/api/ai/status/route.ts", "app/api/system/ready/route.ts", "docs/ops/pilot-runbook.md", "docs/ops/alerts.prometheus.yml"];
    const present = files.filter((f) => existsSync(join(ROOT, f)));
    return { status: present.length === files.length && j?.success ? "PASS" : "FAIL", counts: { controlsPresent: present.length, controlsExpected: files.length, tests: j?.numPassedTests ?? null }, controls: { killSwitch: "AI_KILL_SWITCH", allowlist: "PILOT_ORG_ALLOWLIST", bounds: "PILOT_MAX_REQUEST_TOKENS / PILOT_MAX_TOOL_ROUNDS + ai_budgets", mandatoryConfirmation: "server-side copilot_proposals (client cannot supply arguments)", reversibility: "docs/ops/pilot-runbook.md" }, note: "Controls exist and are unit-tested; their behaviour on the real deployment is verified only by r6-deployed-gate." };
  });
  gate("r6-backup-restore", "R6", () => blockedExt("backups are operated by the database provider; no pg_dump/pg_restore or provider access here", "execute a provider restore into a scratch project, then run the post-restore checklist in docs/ops/pilot-runbook.md and attach output"));
  gate("r6-billing", "R6", () => ({ status: "NOT_IMPLEMENTED", detail: { reason: "No billing/subscription/payment system exists; licensing is an offline signed key (lib/license.ts). Pilot must be invoiced contractually." } }));
  gate("r6-failure-injection", "R6", () => {
    const r = sh("npx", ["jest", "--json", "--silent", "tests/unit/storagePipeline.test.ts", "tests/unit/proposalLifecycle.test.ts", "tests/unit/aiAuthority.test.ts"]);
    const j = lastJson(r.stdout);
    return { status: "BLOCKED_EXTERNAL", detail: { reason: "15 failure cases require faults on real infrastructure (provider down/401/429/500/timeout, DB down, storage down, scanner down, tracking down, metrics down). Application-level handling of scanner/proposal/AI-authority failures is unit-covered (supporting only).", unblockBy: "run scripts/phase-r/deployed-gate.mjs and operator fault injection per docs/ops/pilot-runbook.md" }, supporting: { unitTests: j ? { passed: j.numPassedTests, failed: j.numFailedTests } : null } };
  });
  gate("r6-performance", "R6", () => blockedExt("no production deployment; sandbox latency would be an invented baseline", "scripts/phase-r/deployed-gate.mjs records p50/p95/p99/error-rate per endpoint on the real host"));

  /* ── Security sweep ───────────────────────────────────────────────────── */
  gate("security-secret-scan", "security", () => {
    const pattern = "eyJ[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{30,}\\.[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{24,}|gsk_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9]{10,}|postgres(ql)?://[^:/[:space:]]+:[^@[:space:]]+@|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|xox[bp]-[0-9A-Za-z-]{20,}";
    const r = sh("bash", ["-lc", `git ls-files | grep -vE '^docs/generated|package-lock|\\.(png|jpg|ico|svg|woff2?)$|^tests/unit/observability\\.test\\.ts$|^docs/TEST_LICENSE_KEYS\\.txt$' | xargs grep -nE '${pattern}' || true`]);
    const PLACEHOLDER = /postgres(ql)?:\/\/(user|username|USER|postgres):(pass|password|PASSWORD|…)@|…:…@/;
    const hits = r.stdout.trim().split("\n").filter(Boolean).filter((l) => !PLACEHOLDER.test(l));
    return { status: hits.length === 0 ? "PASS" : "FAIL", counts: { hits: hits.length }, hits, placeholderRule: "postgres://user:pass@ and ellipsis placeholders in UI hint text are not credentials", allowlisted: ["tests/unit/observability.test.ts (synthetic fixtures)", "docs/TEST_LICENSE_KEYS.txt (public-key-verifiable test licence tokens, no secret material)"] };
  });
  gate("security-dependency-audit", "security", () => {
    const r = sh("npm", ["audit", "--json"]);
    const j = lastJson(r.stdout);
    const v = j?.metadata?.vulnerabilities ?? null;
    const items = j ? Object.entries(j.vulnerabilities).map(([k, x]) => ({ pkg: k, severity: x.severity, direct: x.isDirect, fix: x.fixAvailable?.version ? `${x.fixAvailable.name}@${x.fixAvailable.version}${x.fixAvailable.isSemVerMajor ? " (major)" : ""}` : String(x.fixAvailable) })) : [];
    const critical = v?.critical ?? 0;
    return { status: critical === 0 ? "PASS" : "FAIL", counts: v, items, note: "High findings are in next@14 (image optimizer DoS — only with remotePatterns wildcard, verify next.config), postcss via next, glob via eslint-config-next (dev-only). Fix requires major upgrade to Next 16 — out of Phase R scope; recorded as production risk." };
  });
  gate("security-code-patterns", "security", () => {
    const g = (pat, paths = "app lib components middleware.ts") => sh("bash", ["-lc", `git grep -nE '${pat}' -- ${paths} || true`]).stdout.trim().split("\n").filter(Boolean);
    const dsi = g("dangerouslySetInnerHTML");
    const clientRole = g("(headers|searchParams|body|json)\\b[^\\n]*\\b(role|organizationId|actorId)\\b[^\\n]*(trust|as OrgRole)", "app/api");
    const debugLog = g("console\\.(log|debug)\\([^)]*(password|token|secret|cookie|authorization)", "app lib");
    const dsiOk = dsi.every((l) => /app\/layout\.tsx/.test(l) && /THEME_GUARD/.test(l));
    return { status: dsiOk && clientRole.length === 0 && debugLog.length === 0 ? "PASS" : "FAIL", counts: { dangerouslySetInnerHTML: dsi.length, clientControlledAuthz: clientRole.length, sensitiveDebugLogging: debugLog.length }, detail: { dangerouslySetInnerHTML: dsi, note: "app/layout.tsx THEME_GUARD is a static, constant inline script (no interpolation) — accepted." } };
  });

  /* ── finalize ─────────────────────────────────────────────────────────── */
  const fingerprintAfter = sourceFingerprint();
  if (fingerprintAfter.sha256 !== fingerprintBefore.sha256) throw new Error("source tree changed while gates were running — evidence discarded");

  const count = (s) => gates.filter((g) => g.status === s).length;
  const failed = gates.filter((g) => g.status === "FAIL");
  const blocked = gates.filter((g) => g.status === "BLOCKED_EXTERNAL");
  let verdict;
  if (failed.length) verdict = "NOT PRODUCTION PILOT READY";
  else if (blocked.length) verdict = "PRODUCTION PILOT READY — EXTERNAL INFRASTRUCTURE BLOCKED";
  else verdict = "PRODUCTION PILOT READY";

  const evidence = {
    phase: "R — production launch validation",
    generatedAt: new Date().toISOString(),
    generator: "scripts/phase-r-evidence.mjs",
    staleGuard: { gitHead: head, branch, buildId, sourceFingerprint: fingerprintAfter, verifyCommand: "node scripts/phase-r-evidence.mjs --verify" },
    environment: {
      kind: process.env.PILOT_BASE_URL ? "deployed" : "sandbox (no egress, no credentials)",
      node: process.version,
      deployment: process.env.PILOT_BASE_URL ? process.env.PILOT_BASE_URL.replace(/^https?:\/\//, "").split("/")[0] : null,
      database: dbIdentity,
      providers: {
        ai: process.env.AI_BRIDGE_URL ? "bridge (provider reported in phase-r-cognitive.json)" : null,
        storage: process.env.STORAGE_PROVIDER || null,
        malwareScanner: process.env.MALWARE_SCANNER || null,
        metrics: process.env.METRICS_BACKEND || null,
        errorTracking: process.env.ERROR_TRACKING_DSN ? "dsn (redacted)" : process.env.ERROR_TRACKING_WEBHOOK ? "webhook (redacted)" : null,
      },
    },
    baseline: { requested: "Phase Q (as quoted in the brief)", actual: "main@9ffbecf00bd143ff57896a84566fd39ce85ad46f + Phase R1 (209b67c)", mismatch: "No Phase Q artifacts, suites or counts exist in this repository; quoted Phase Q counts could not be reproduced and are not used." },
    summary: { gates: gates.length, pass: count("PASS"), fail: count("FAIL"), blockedExternal: count("BLOCKED_EXTERNAL"), notImplemented: count("NOT_IMPLEMENTED") },
    gates,
    verdict,
  };
  for (const k of ["generatedAt", "staleGuard", "environment", "summary", "gates", "verdict"]) if (evidence[k] === undefined) throw new Error(`missing key ${k}`);
  writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + "\n");

  const gap = {
    phase: "R",
    generatedAt: evidence.generatedAt,
    staleGuard: evidence.staleGuard,
    verdict,
    externalBlockers: blocked.map((g) => ({ gate: g.id, area: g.area, reason: g.detail?.reason, unblockBy: g.detail?.unblockBy })),
    internalBlockers: failed.map((g) => ({ gate: g.id, area: g.area, detail: g.detail ?? g.counts })),
    notImplemented: gates.filter((g) => g.status === "NOT_IMPLEMENTED").map((g) => ({ gate: g.id, reason: g.detail?.reason })),
    productionRisks: [
      "next@14.2.x carries high-severity advisories (image optimizer DoS, postcss); remediation is a major upgrade to Next 16 — schedule before GA, restrict images.remotePatterns meanwhile.",
      "Pre-existing migration drift in 202608150003–0006 on a from-scratch database; Supabase project must be created from the linked project history, not a bare replay.",
      "Alerting is defined (docs/ops/alerts.prometheus.yml) but unproven until a real alert fires end-to-end.",
      "R5 cognitive thresholds are declared but the real-model run has not executed; no score exists.",
      "Legacy resume URLs stored before Phase R (public bucket paths) remain readable until the candidate-resumes bucket is made private and rows are migrated to document ids.",
    ],
  };
  writeFileSync(GAP, JSON.stringify(gap, null, 2) + "\n");
  console.log(JSON.stringify({ verdict, summary: evidence.summary, evidence: "docs/generated/phase-r-evidence.json", gap: "docs/generated/phase-r-readiness-gap.json" }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

function verify() {
  if (!existsSync(EVIDENCE)) {
    console.error("no evidence file");
    process.exit(1);
  }
  const ev = JSON.parse(readFileSync(EVIDENCE, "utf8"));
  const now = sourceFingerprint();
  const head = git(["rev-parse", "HEAD"]);
  const fresh = ev.staleGuard.sourceFingerprint.sha256 === now.sha256;
  const ageMinutes = Math.round((Date.now() - Date.parse(ev.generatedAt)) / 60000);
  const legal = ev.gates.every((g) => STATUSES.has(g.status));
  console.log(JSON.stringify({ fresh, legalStatuses: legal, headMatches: ev.staleGuard.gitHead === head, generatedAt: ev.generatedAt, ageMinutes, buildId: ev.staleGuard.buildId, verdict: ev.verdict }, null, 2));
  process.exit(fresh && legal ? 0 : 1);
}

main();
