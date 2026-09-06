#!/usr/bin/env node
/**
 * Phase R1 — architectural duplicate / dangerous-pattern check.
 *
 * Machine-checkable assertions that there is exactly ONE production
 * definition of each authorization primitive, that no consumer bypasses it,
 * and that no fail-open pattern remains in application source.
 *
 * Exit 1 on any violation. Emits a JSON report on stdout.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_DIRS = ["app", "lib", "src", "components", "hooks", "middleware.ts"];
const IGNORE_DIRS = new Set(["node_modules", ".next", "dist", "build", "out", "coverage", "docs-legacy"]);

function walk(target, out = []) {
  const abs = join(ROOT, target);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (/\.(ts|tsx)$/.test(abs) && !/\.d\.ts$/.test(abs)) out.push(abs);
    return out;
  }
  for (const entry of readdirSync(abs)) {
    if (IGNORE_DIRS.has(entry)) continue;
    walk(join(target, entry), out);
  }
  return out;
}

const files = SRC_DIRS.flatMap((d) => walk(d));
const sources = new Map(files.map((f) => [relative(ROOT, f), readFileSync(f, "utf8")]));

const checks = [];
function check(id, description, violations, meta = {}) {
  checks.push({ id, description, ok: violations.length === 0, violations, ...meta });
}

const matches = (re, { allow = () => false } = {}) => {
  const hits = [];
  for (const [file, text] of sources) {
    if (allow(file)) continue;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  return hits;
};

const is = (...allowed) => (file) => allowed.includes(file);

/* 1. Exactly one canonical resolver + one pure model. */
check(
  "canonical-resolver-single-definition",
  "resolveCanonicalAuthz is defined exactly once (lib/authz/canonical.ts)",
  matches(/export const resolveCanonicalAuthz\b/, { allow: is("lib/authz/canonical.ts") }),
  { definitions: matches(/export const resolveCanonicalAuthz\b/).length },
);
check(
  "canonical-selector-single-definition",
  "selectCanonicalMembership is defined exactly once (lib/authz/model.ts)",
  matches(/export function selectCanonicalMembership\b/, { allow: is("lib/authz/model.ts") }),
);
check(
  "role-tier-mapping-single-definition",
  "canonical role-code → tier mapping exists only in lib/authz/model.ts",
  matches(/ROLE_CODE_TO_TIER\s*[:=]/, { allow: is("lib/authz/model.ts") }),
);
check(
  "no-legacy-normalizeRole",
  "the lenient normalizeRole() (unknown → EMPLOYEE default) no longer exists",
  matches(/function normalizeRole\b|normalizeRole\(/),
);

/* 2. No consumer reads membership/role tables for authorization. */
const membershipReaders = matches(/\.from\(\s*["'`](organization_memberships|roles)["'`]\s*\)/);
check(
  "no-legacy-role-table-reads",
  "no application code reads organization_memberships / roles",
  membershipReaders,
);
const canonicalTableReaders = matches(/\.from\(\s*["'`]memberships["'`]\s*\)/, {
  allow: (file) =>
    [
      "lib/authz/canonical.ts", // the resolver
      "lib/actions.ts", // owner/admin-guarded membership management writes
      "lib/api.ts", // members directory listing (not authorization)
      "lib/seats.ts", // seat counting (not authorization)
      "lib/tenant.ts", // server-side claim pinning after signup
      "lib/scim/provisioning.ts", // IdP provisioning writes (service role)
      "app/api/account/delete/route.ts", // account erasure
      "middleware.ts", // rate-limit bucketing only
    ].includes(file),
});
check(
  "memberships-read-only-by-resolver",
  "only the canonical resolver (and audited non-authorization utilities) touch `memberships`",
  canonicalTableReaders,
);
check(
  "no-rpc-role-resolution",
  "no consumer resolves roles through legacy RPCs",
  matches(/rpc\(\s*["'`](scim_list_memberships|bootstrap_organization)["'`]/, { allow: is("lib/scim/provisioning.ts", "app/actions/workspaceAccessActions.ts") }),
);

/* 3. No silent fallback to a default role. */
check(
  "no-default-member-fallback",
  "no `roleCode = 'member'` / `|| 'member'` / `?? 'member'` default in authorization code",
  matches(/(roleCode\s*=\s*['"]member['"]|\|\|\s*['"]member['"]|\?\?\s*['"]member['"]|['"]member['"]\)\s*\.toLowerCase)/, {
    allow: (file) => file === "lib/scim/provisioning.ts", // IdP provisioning default for a NEW assignment, audited above
  }),
);
check(
  "no-hardcoded-privileged-role-sets",
  "no ad-hoc privileged role code lists remain (must use isPrivileged / requireRole)",
  matches(/\[\s*['"]owner['"],\s*['"]admin['"],\s*['"]hr_admin['"]/),
);
check(
  "no-copilot-agent-actor-fallback",
  "audit attribution never falls back to a synthetic 'copilot-agent' actor",
  matches(/["']copilot-agent["']/).filter((hit) => !/:\d+:\s*(\/\*\*|\*|\/\/)/.test(hit)), // ignore comments
);

/* 4. No client-controlled authorization inputs. */
check(
  "no-client-org-header-authorization",
  "X-Organization-Id / organization_id from requests is never used to build an authorization context",
  matches(/headers\(\)\.get\(\s*["']x-organization-id["']\s*\)|request\.headers\.get\(\s*["']x-organization-id["']\s*\)/i),
);
check(
  "e2e-role-override-gated",
  "the E2E role override header is read only in lib/rbac.ts and gated by env + non-production",
  matches(/x-fluxentiq-e2e-role/, { allow: is("lib/rbac.ts") }),
);
{
  const rbac = sources.get("lib/rbac.ts") ?? "";
  const gated = /E2E_ROLE_OVERRIDE_ENABLED !== "1"/.test(rbac) && /NODE_ENV === "production"/.test(rbac);
  check("e2e-role-override-env-gate", "E2E override requires E2E_ROLE_OVERRIDE_ENABLED=1 and NODE_ENV!=production", gated ? [] : ["lib/rbac.ts: gate missing"]);
}

/* 5. All authorization consumers import from the canonical module chain. */
const consumers = [
  "lib/rbac.ts",
  "lib/auth.ts",
  "app/actions/_shared.ts",
  "src/lib/ai/copilotTools.ts",
  "app/actions/workspaceAccessActions.ts",
];
check(
  "consumers-import-canonical",
  "every authorization consumer imports resolveCanonicalAuthz from lib/authz/canonical",
  consumers.filter((f) => !/from ["']@\/lib\/authz\/canonical["']/.test(sources.get(f) ?? "")).map((f) => `${f}: missing canonical import`),
);
check(
  "copilot-route-uses-rbac",
  "agentic Copilot route derives actor/org from getRbacContext (not getCurrentUser / request body)",
  (() => {
    const src = sources.get("app/api/ai/copilot/route.ts") ?? "";
    const v = [];
    if (!/getRbacContext\(\)/.test(src)) v.push("missing getRbacContext");
    if (/getCurrentUser\(/.test(src)) v.push("still uses getCurrentUser");
    if (/parsed\.data\.context\??\.organization_id/.test(src)) v.push("reads organization_id from body");
    return v;
  })(),
);
check(
  "admin-copilot-route-deny-first",
  "admin Copilot route requires HR_ADMIN via canonical RBAC before bridge/LLM spend",
  /requireRole\("HR_ADMIN"\)/.test(sources.get("app/api/ai/admin-copilot/route.ts") ?? "") ? [] : ["app/api/ai/admin-copilot/route.ts: missing requireRole"],
);
check(
  "privileged-lib-actions-guarded",
  "privileged legacy server actions call requireRole",
  (() => {
    const src = sources.get("lib/actions.ts") ?? "";
    const need = ["createEmployee", "setEmploymentStatus", "moveCandidateStage", "resolveLeaveRequest", "executePayrollRun", "setPayrollRunStatus", "updateOrganization", "addMemberByEmail", "updateMemberRole", "removeMember", "createCandidate", "updateCandidateResume"];
    return need.filter((fn) => {
      const i = src.indexOf(`export async function ${fn}(`);
      if (i < 0) return true;
      const body = src.slice(i, src.indexOf("\n}\n", i));
      return !/await requireRole\(/.test(body);
    }).map((fn) => `lib/actions.ts: ${fn} lacks requireRole`);
  })(),
);

/* 6. Dead duplicate permission models are gone. */
check(
  "dead-permission-models-removed",
  "src/lib/auth/permissions.ts, src/services/rbacService.ts, app/actions/rbacActions.ts, types/rbac.ts are removed",
  ["src/lib/auth/permissions.ts", "src/services/rbacService.ts", "app/actions/rbacActions.ts", "types/rbac.ts"].filter((f) => sources.has(f)),
);

/* 7. Database: exactly one canonical definition of each helper in the LAST migration touching it. */
{
  const dir = join(ROOT, "supabase", "migrations");
  const migs = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const last = (fnName) => {
    let file = null;
    for (const f of migs) {
      const text = readFileSync(join(dir, f), "utf8");
      if (new RegExp(`(CREATE OR REPLACE FUNCTION|create or replace function)\\s+public\\.${fnName}\\s*\\(`, "i").test(text)) file = f;
    }
    return file;
  };
  const canonicalMig = "20260906000100_canonical_membership_authz.sql";
  const helpers = ["user_role", "is_organization_member", "is_org_member", "bootstrap_organization", "scim_assign_membership", "scim_list_memberships"];
  const wrong = helpers.filter((h) => last(h) !== canonicalMig).map((h) => `${h}: last definition in ${last(h)}`);
  check("db-helpers-final-definition-canonical", "final definition of every membership/role helper lives in the canonical migration", wrong);
  const canonicalText = readFileSync(join(dir, canonicalMig), "utf8");
  const bodyRefs = canonicalText.match(/FROM\s+(public\.)?(organization_memberships|roles)\b/gi) ?? [];
  check("db-canonical-migration-reads-memberships-only", "canonical migration helper bodies never read organization_memberships/roles", bodyRefs);
  check(
    "db-user_role-no-default",
    "user_role() has no COALESCE(..., 'EMPLOYEE') default",
    /COALESCE\([\s\S]*'EMPLOYEE'\s*\)/.test(canonicalText.slice(canonicalText.indexOf("FUNCTION public.user_role"))) ? ["default tier present"] : [],
  );
}

const failed = checks.filter((c) => !c.ok);
const report = {
  check: "authz-duplicate-check",
  generatedAt: new Date().toISOString(),
  filesScanned: sources.size,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
};
console.log(JSON.stringify(report, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
