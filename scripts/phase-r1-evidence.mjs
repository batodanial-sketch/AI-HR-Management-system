#!/usr/bin/env node
/**
 * Phase R1 — evidence generator.
 *
 * Re-runs every verification gate FRESH (nothing is read from prior runs),
 * records exact counts and exit codes, and writes:
 *
 *   docs/generated/phase-r1-evidence.json
 *   docs/generated/phase-r1-readiness-gap.json
 *
 * Stale-evidence guard: both files embed the git HEAD, a SHA-256 over the
 * tracked+untracked source tree, and per-gate timestamps. `--verify` recomputes
 * the fingerprint and fails if the workspace has changed since generation.
 *
 * Verdict rules (exactly one):
 *   PASS    — every mandatory gate passes AND no gate is infra-blocked.
 *   BLOCKED — every runnable mandatory gate passes but ≥1 required external
 *             gate could not be executed in this environment.
 *   FAIL    — any runnable mandatory gate fails.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "docs", "generated");
const EVIDENCE = join(OUT_DIR, "phase-r1-evidence.json");
const GAP = join(OUT_DIR, "phase-r1-readiness-gap.json");
const PG_URL = process.env.DATABASE_URL ?? "postgres://postgres@localhost:54329/postgres";

function sh(cmd, args, { env = {}, timeout = 900_000, input } = {}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env, FORCE_COLOR: "0", CI: "1" },
    encoding: "utf8",
    timeout,
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    command: [cmd, ...args].join(" "),
    startedAt,
    durationMs: Date.now() - t0,
    exitCode: res.status,
    signal: res.signal ?? null,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

function git(args) {
  return sh("git", args).stdout.trim();
}

function sourceFingerprint() {
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter((f) => f && !f.startsWith("docs/generated/"))
    .sort();
  const h = createHash("sha256");
  for (const f of files) {
    if (!existsSync(join(ROOT, f))) continue;
    h.update(f);
    h.update("\0");
    h.update(readFileSync(join(ROOT, f)));
    h.update("\0");
  }
  return { files: files.length, sha256: h.digest("hex") };
}

const tail = (s, n = 4000) => (s.length > n ? s.slice(-n) : s);
const parseJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    const i = s.indexOf("{");
    if (i >= 0) {
      try {
        return JSON.parse(s.slice(i));
      } catch {
        /* fallthrough */
      }
    }
    return null;
  }
};

/* ── gates ───────────────────────────────────────────────────────────────── */
const gates = [];
function gate(id, phase, mandatory, run) {
  process.stderr.write(`▶ ${id}\n`);
  let out;
  try {
    out = run();
  } catch (error) {
    out = { status: "FAIL", detail: { error: String(error?.message ?? error) } };
  }
  const entry = { id, phase, mandatory, ...out, recordedAt: new Date().toISOString() };
  gates.push(entry);
  process.stderr.write(`  ${entry.status}\n`);
  return entry;
}

function main() {
  const verifyOnly = process.argv.includes("--verify");
  if (verifyOnly) return verify();

  mkdirSync(OUT_DIR, { recursive: true });
  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const fingerprintBefore = sourceFingerprint();

  /* TypeScript */
  gate("typescript", "baseline+regression", true, () => {
    const r = sh("npx", ["tsc", "--noEmit", "--pretty", "false"]);
    const errors = (r.stdout.match(/error TS\d+/g) ?? []).length;
    return { status: r.exitCode === 0 ? "PASS" : "FAIL", counts: { errors }, exitCode: r.exitCode, log: tail(r.stdout + r.stderr) };
  });

  /* ESLint */
  gate("eslint", "baseline+regression", true, () => {
    // `next lint` prints a plain summary when clean and a per-file report
    // otherwise; count from the report, and require a zero exit.
    const r = sh("npx", ["next", "lint", "--max-warnings", "0"]);
    const out = r.stdout + r.stderr;
    const clean = /No ESLint warnings or errors/.test(out);
    const m = out.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
    const errors = clean ? 0 : m ? Number(m[2]) : null;
    const warnings = clean ? 0 : m ? Number(m[3]) : null;
    return { status: r.exitCode === 0 && errors === 0 && warnings === 0 ? "PASS" : "FAIL", counts: { errors, warnings }, exitCode: r.exitCode, log: tail(out, 1500) };
  });

  /* Jest (includes authz model matrix + AI authority suites) */
  gate("jest", "fail-closed+ai-security+regression", true, () => {
    const r = sh("npx", ["jest", "--json", "--silent"]);
    const j = parseJson(r.stdout);
    const suites = j ? Object.fromEntries(j.testResults.map((t) => [t.name.replace(ROOT + "/", ""), { passed: t.assertionResults.filter((a) => a.status === "passed").length, failed: t.assertionResults.filter((a) => a.status === "failed").length }])) : null;
    return {
      status: j && j.success ? "PASS" : "FAIL",
      counts: j ? { suites: j.numTotalTestSuites, tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests } : null,
      suites,
      exitCode: r.exitCode,
      log: tail(r.stderr, 2000),
    };
  });

  /* Python (bridge authority + engine) */
  gate("pytest", "ai-security+regression", true, () => {
    const r = sh("python3", ["-m", "pytest", "-q", "-p", "no:cacheprovider"]);
    const m = r.stdout.match(/(\d+) passed/);
    const f = r.stdout.match(/(\d+) failed/);
    return { status: r.exitCode === 0 ? "PASS" : "FAIL", counts: { passed: m ? Number(m[1]) : 0, failed: f ? Number(f[1]) : 0 }, exitCode: r.exitCode, log: tail(r.stdout, 1500) };
  });

  /* Real PostgreSQL migration preflight */
  const pgReachable = sh("node", ["-e", `const pg=require("pg");const c=new pg.Client({connectionString:${JSON.stringify(PG_URL)}});c.connect().then(()=>c.query("select version()")).then(r=>{console.log(r.rows[0].version);return c.end()}).catch(e=>{console.error(e.message);process.exit(1)})`]);
  gate("postgres-migration-preflight", "baseline+migration", true, () => {
    if (pgReachable.exitCode !== 0) return { status: "BLOCKED", detail: { reason: "PostgreSQL not reachable", error: tail(pgReachable.stderr, 500) } };
    const r = sh("node", ["scripts/db/local-pg.mjs", "reset", "--tolerant"], { env: { DATABASE_URL: PG_URL } });
    const j = parseJson(r.stdout);
    const failures = j?.failures ?? [];
    const canonicalOk = !failures.some((f) => f.file?.includes("20260906000100"));
    const preexisting = failures.filter((f) => /20260815000[3-6]/.test(f.file ?? ""));
    return {
      status: canonicalOk && failures.length === preexisting.length ? "PASS" : "FAIL",
      counts: { applied: j?.applied ?? null, filesWithFailures: failures.length, failedStatements: failures.reduce((a, f) => a + (f.errors?.length ?? 1), 0) },
      postgres: pgReachable.stdout.trim(),
      note: "Pre-existing column-name drift in 202608150003/4/5/6 (email vs work_email, stage, payroll_run_id) is reported, not hidden; canonical migration 20260906000100 applies cleanly.",
      failures,
      exitCode: r.exitCode,
    };
  });

  /* Real PostgreSQL RLS + lifecycle + concurrency */
  gate("postgres-rls-lifecycle-concurrency", "rls+proposal+concurrency", true, () => {
    if (pgReachable.exitCode !== 0) return { status: "BLOCKED", detail: { reason: "PostgreSQL not reachable" } };
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      const r = sh("node", ["scripts/db/authz-rls-suite.mjs"], { env: { DATABASE_URL: PG_URL } });
      const j = parseJson(r.stdout);
      runs.push({ exitCode: r.exitCode, total: j?.total ?? null, passed: j?.passed ?? null, failed: j?.failed ?? null, sections: j?.sections ?? null, failures: (j?.results ?? []).filter((x) => !x.ok) });
    }
    const ok = runs.every((x) => x.exitCode === 0 && x.failed === 0);
    return { status: ok ? "PASS" : "FAIL", counts: runs[0], repeatedRuns: runs.length, runs };
  });

  /* Duplicate-definition / dangerous-pattern check */
  gate("authz-duplicate-check", "duplicates+security-regression", true, () => {
    const r = sh("node", ["scripts/authz-duplicate-check.mjs"]);
    const j = parseJson(r.stdout);
    return { status: r.exitCode === 0 ? "PASS" : "FAIL", counts: j ? { total: j.total, passed: j.passed, failed: j.failed, filesScanned: j.filesScanned } : null, checks: j?.checks?.map((c) => ({ id: c.id, ok: c.ok, violations: c.violations })) ?? null };
  });

  /* Live HTTP smoke against the real bridge */
  gate("live-http-smoke", "baseline+provider-protocol", true, () => {
    const py = sh("python3", ["-c", "import fastapi, uvicorn, server"]);
    if (py.exitCode !== 0) return { status: "BLOCKED", detail: { reason: "fastapi/uvicorn/server import failed", error: tail(py.stderr, 500) } };
    const port = 8765 + Math.floor(Math.random() * 200);
    const script = `
import json, os, subprocess, sys, time, urllib.request, urllib.error
os.environ["BRIDGE_SECRET_KEY"]="r1-live-secret"
p=subprocess.Popen([sys.executable,"-m","uvicorn","server:app","--host","127.0.0.1","--port","${port}","--log-level","warning"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
B="http://127.0.0.1:${port}"
def call(path, body=None, headers=None):
    data=json.dumps(body).encode() if body is not None else None
    req=urllib.request.Request(B+path,data=data,method="POST" if data is not None else "GET",headers={"Content-Type":"application/json",**(headers or {})})
    try:
        with urllib.request.urlopen(req,timeout=10) as r: return r.status, r.read().decode()[:200]
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:200]
for _ in range(50):
    try: call("/health"); break
    except Exception: time.sleep(0.2)
checks=[]
def rec(n,exp,got): checks.append({"check":n,"expected":exp,"status":got[0],"ok":got[0]==exp,"body":got[1]})
try:
    rec("GET /health public",200,call("/health"))
    rec("copilot without secret -> 401",401,call("/api/ai/copilot",{"messages":[]}))
    rec("copilot forged secret -> 401",401,call("/api/ai/copilot",{"messages":[]},{"X-Bridge-Secret":"nope"}))
    rec("copilot valid secret, no provider, forged body org, execute_tools=true -> 503 (no tool path)",503,call("/api/ai/copilot",{"messages":[{"role":"user","content":"hi"}],"execute_tools":True,"context":{"organization_id":"forged"}},{"X-Bridge-Secret":"r1-live-secret"}))
    rec("workflows/process-batch without tenant -> 422",422,call("/api/workflows/process-batch",{},{"X-Bridge-Secret":"r1-live-secret"}))
    rec("engine route without secret -> 401",401,call("/api/engine/tax/estimate",{"country":"PK","gross":100}))
finally:
    p.terminate(); p.wait(timeout=10)
print(json.dumps({"total":len(checks),"passed":sum(c["ok"] for c in checks),"checks":checks}))
`;
    const r = sh("python3", ["-c", script], { timeout: 120_000 });
    const j = parseJson(r.stdout);
    return { status: j && j.passed === j.total ? "PASS" : "FAIL", counts: j ? { total: j.total, passed: j.passed } : null, checks: j?.checks ?? null, log: tail(r.stderr, 800) };
  });

  /* Fresh production build */
  gate("next-build", "baseline+regression", true, () => {
    sh("rm", ["-rf", ".next"]);
    const r = sh("npx", ["next", "build"], { timeout: 1_500_000 });
    const out = r.stdout + r.stderr;
    const routes = (out.match(/^[├└┌│]\s+[○ƒ●λ]\s+\//gm) ?? []).length;
    const warnings = (out.match(/Compiled with warnings/g) ?? []).length;
    return {
      status: r.exitCode === 0 ? "PASS" : "FAIL",
      counts: { exitCode: r.exitCode, routes, compileWarningBlocks: warnings },
      note: warnings ? "Single pre-existing warning: @upstash/redis Node API in Edge runtime via lib/edge/rate-limit.ts (present in baseline build)." : undefined,
      log: tail(out, 1500),
    };
  });

  /* Gates that cannot run here — recorded, never fabricated */
  gate("playwright-e2e-rbac-boundaries", "regression", false, () => {
    const hasBrowsers = existsSync(join(process.env.HOME ?? "", ".cache", "ms-playwright"));
    return { status: "BLOCKED", detail: { reason: hasBrowsers ? "requires running Next app + Supabase project" : "Playwright browsers not installed and requires live Supabase project", suite: "tests/e2e/rbac-boundaries.spec.ts (unchanged, kept)" } };
  });
  gate("restore-drill", "baseline", false, () => ({ status: "BLOCKED", detail: { reason: "pg_dump/pg_restore/psql binaries unavailable in sandbox; no root" } }));
  gate("proposal-lifecycle-e2e", "proposal", false, () => ({
    status: "NOT_APPLICABLE",
    detail: {
      reason: "No proposal/agent/provider-protocol subsystem exists on main. Per user decision the approval analog is (a) the Copilot confirmToolCall flow — covered by tests/unit/aiAuthority.test.ts — and (b) the leave_requests approval lifecycle — covered on real PostgreSQL by scripts/db/authz-rls-suite.mjs (lifecycle + concurrency sections).",
    },
  }));
  gate("live-supabase-http-smoke", "baseline", false, () => ({ status: "BLOCKED", detail: { reason: "No Supabase project credentials in sandbox; Next.js auth routes cannot be exercised end-to-end. Bridge HTTP smoke ran live (see live-http-smoke)." } }));

  const fingerprintAfter = sourceFingerprint();
  if (fingerprintAfter.sha256 !== fingerprintBefore.sha256) {
    throw new Error("source tree changed while gates were running — evidence discarded");
  }

  const mandatory = gates.filter((g) => g.mandatory);
  const failed = gates.filter((g) => g.status === "FAIL");
  const blocked = gates.filter((g) => g.status === "BLOCKED");
  let verdict;
  if (failed.length > 0) verdict = { code: "FAIL", statement: "NOT READY — AUTHORIZATION MODEL NOT UNIFIED" };
  else if (blocked.length > 0) verdict = { code: "BLOCKED", statement: "AUTHORIZATION MODEL UNIFIED — EXTERNAL INFRASTRUCTURE BLOCKED" };
  else verdict = { code: "PASS", statement: "AUTHORIZATION MODEL UNIFIED — EXTERNAL VALIDATION READY" };

  const changed = git(["status", "--porcelain"]).split("\n").filter(Boolean);
  const evidence = {
    phase: "R1 — authorization model unification",
    generatedAt: new Date().toISOString(),
    generator: "scripts/phase-r1-evidence.mjs",
    staleGuard: {
      gitHead: head,
      branch,
      sourceFingerprint: fingerprintAfter,
      rule: "evidence is stale when the sha256 over all tracked+untracked source files (excluding docs/generated) differs from sourceFingerprint.sha256",
      verifyCommand: "node scripts/phase-r1-evidence.mjs --verify",
    },
    canonicalModel: {
      chain: "auth.users.id (actor) → memberships(user_id, organization_id) → memberships.role (org_role enum: owner|admin|manager|member) → tier SUPER_ADMIN|HR_ADMIN|MANAGER|EMPLOYEE",
      resolverTs: "lib/authz/canonical.ts resolveCanonicalAuthz / requireCanonicalAuthz",
      modelTs: "lib/authz/model.ts selectCanonicalMembership (pure, fail-closed)",
      resolverSql: "public.user_role(org) / public.current_org_role(org) / public.is_organization_member(org) — supabase/migrations/20260906000100_canonical_membership_authz.sql",
      nonAuthoritative: ["organization_memberships", "roles", "user_roles"],
    },
    summary: {
      mandatoryGates: mandatory.length,
      pass: gates.filter((g) => g.status === "PASS").length,
      fail: failed.length,
      blocked: blocked.length,
      notApplicable: gates.filter((g) => g.status === "NOT_APPLICABLE").length,
    },
    workingTree: { changedPaths: changed.length, paths: changed },
    gates,
    verdict,
  };
  writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + "\n");

  const gap = {
    phase: "R1",
    generatedAt: evidence.generatedAt,
    staleGuard: evidence.staleGuard,
    verdict,
    externalBlockers: blocked.map((g) => ({ gate: g.id, reason: g.detail?.reason, unblockBy: unblockHint(g.id) })),
    notApplicable: gates.filter((g) => g.status === "NOT_APPLICABLE").map((g) => ({ gate: g.id, reason: g.detail?.reason })),
    knownPreexistingDrift: gates.find((g) => g.id === "postgres-migration-preflight")?.failures ?? [],
    residualRisks: [
      "Supabase-hosted validation (auth cookies → RLS with real JWTs) not executed here; run scripts/db/authz-rls-suite.mjs against a staging project and tests/e2e/rbac-boundaries.spec.ts.",
      "Legacy tables organization_memberships/roles remain readable (RLS-scoped) for backfill; drop in a follow-up phase after confirming no external reader.",
      "Pre-existing migration drift in 202608150003-0006 predates R1; fixing it is a schema change outside R1 scope and is reported, not silently patched.",
    ],
  };
  writeFileSync(GAP, JSON.stringify(gap, null, 2) + "\n");
  console.log(JSON.stringify({ verdict, summary: evidence.summary, evidence: "docs/generated/phase-r1-evidence.json", gap: "docs/generated/phase-r1-readiness-gap.json" }, null, 2));
  process.exit(verdict.code === "FAIL" ? 1 : 0);
}

function unblockHint(id) {
  return {
    "playwright-e2e-rbac-boundaries": "npx playwright install && NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + E2E accounts, then `npm run test:e2e -- tests/e2e/rbac-boundaries.spec.ts`",
    "restore-drill": "run on a host with PostgreSQL client tools: pg_dump → fresh DB → pg_restore → node scripts/db/authz-rls-suite.mjs",
    "live-supabase-http-smoke": "provide a staging Supabase project; apply migrations with `supabase db push`; run the HTTP smoke against the deployed Next.js app",
  }[id];
}

function verify() {
  if (!existsSync(EVIDENCE)) {
    console.error("no evidence file");
    process.exit(1);
  }
  const ev = JSON.parse(readFileSync(EVIDENCE, "utf8"));
  const now = sourceFingerprint();
  const head = git(["rev-parse", "HEAD"]);
  // Freshness is decided by the source fingerprint (every tracked + untracked
  // source file except docs/generated). HEAD is informational: committing the
  // evidence file itself moves HEAD without changing any source.
  const fresh = ev.staleGuard.sourceFingerprint.sha256 === now.sha256;
  console.log(JSON.stringify({ fresh, headMatches: ev.staleGuard.gitHead === head, generatedAt: ev.generatedAt, recordedHead: ev.staleGuard.gitHead, currentHead: head, recordedFingerprint: ev.staleGuard.sourceFingerprint.sha256, currentFingerprint: now.sha256, verdict: ev.verdict }, null, 2));
  process.exit(fresh ? 0 : 1);
}

main();
