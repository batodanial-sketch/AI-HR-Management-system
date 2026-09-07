#!/usr/bin/env node
/**
 * Local real-PostgreSQL harness for schema / RLS / concurrency verification.
 *
 * Applies the full `supabase/migrations` chain against a plain PostgreSQL
 * instance (no Supabase CLI required). Supabase-specific runtime surface is
 * shimmed to the minimum the migrations depend on:
 *
 *   - `auth.users`  table (id, email, raw_user_meta_data, …)
 *   - `auth.uid()`  reads `current_setting('request.jwt.claim.sub', true)`
 *   - `auth.role()` reads `current_setting('request.jwt.claim.role', true)`
 *   - roles `anon`, `authenticated`, `service_role` (NOLOGIN, like Supabase)
 *   - `pg_graphql` extension stubbed (not needed for schema correctness)
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/db/local-pg.mjs migrate            # strict
 *   DATABASE_URL=postgres://... node scripts/db/local-pg.mjs reset [--tolerant]  # drop + reapply
 *
 * The harness never runs against a URL that does not look local unless
 * `LOCAL_PG_ALLOW_REMOTE=1` is set — it is a destructive test tool.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

export const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const local = /localhost|127\.0\.0\.1|\/tmp|host=\/|@\/|sslmode=disable/.test(url) || !/@/.test(url);
  if (!local && process.env.LOCAL_PG_ALLOW_REMOTE !== "1") {
    throw new Error("Refusing to run destructive harness against a non-local DATABASE_URL");
  }
  return url;
}

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

const AUTH_SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

/** Migrations reference Supabase-only extensions; stub them when absent. */
function neutralizeUnavailableExtensions(sql) {
  return sql.replace(/create extension if not exists\s+"?pg_graphql"?\s*;/gi, "-- pg_graphql (stubbed by local harness)");
}

export async function resetDatabase(client) {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.query("DROP SCHEMA IF EXISTS auth CASCADE;");
  await client.query("DROP SCHEMA IF EXISTS extensions CASCADE;");
  await client.query("DROP SCHEMA IF EXISTS supabase_migrations CASCADE;");
  await client.query("GRANT ALL ON SCHEMA public TO public;");
}

/**
 * Splits a migration into statements while respecting $$-quoted bodies,
 * single-quoted strings and line comments. Used for statement-tolerant
 * application so a pre-existing defect in one file does not hide the rest of
 * the schema from the verification suites — every failure is RECORDED and
 * surfaced in the evidence, never swallowed.
 */
export function splitSql(sql) {
  const out = [];
  let cur = "";
  let dollar = null;
  let inStr = false;
  let lineComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (lineComment) {
      cur += ch;
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (!dollar && !inStr && ch === "-" && sql[i + 1] === "-") {
      lineComment = true;
      cur += ch;
      continue;
    }
    if (!inStr && ch === "$") {
      const m = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
      if (m) {
        if (!dollar) dollar = m[0];
        else if (dollar === m[0]) dollar = null;
        cur += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (!dollar && ch === "'") inStr = !inStr;
    if (!dollar && !inStr && ch === ";") {
      out.push(cur + ";");
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((stmt) => stmt.replace(/--.*$/gm, "").trim().length > 0);
}

/**
 * Applies the migration chain.
 *
 * mode = "strict"   → each file in one transaction; first failure throws.
 * mode = "tolerant" → statement by statement; failures are collected per
 *                     file and returned (used to verify schemas whose chain
 *                     has pre-existing ordering defects).
 */
const LEDGER_SQL = `
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text,
  applied_at timestamptz NOT NULL DEFAULT now()
);`;

export async function applyMigrations(client, { log = () => {}, mode = "strict" } = {}) {
  await client.query(AUTH_SHIM);
  await client.query(LEDGER_SQL);
  const applied = [];
  const skipped = [];
  const failures = [];
  const ledger = new Set((await client.query("SELECT version FROM supabase_migrations.schema_migrations")).rows.map((r) => r.version));
  for (const file of migrationFiles()) {
    const version = file.split("_")[0];
    if (ledger.has(version)) {
      skipped.push(file);
      continue;
    }
    const sql = neutralizeUnavailableExtensions(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    if (mode === "strict") {
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ($1, $2)", [version, file]);
        await client.query("COMMIT");
        applied.push(file);
        log(`applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(`migration ${file} failed: ${error.message}`);
      }
      continue;
    }
    const fileFailures = [];
    for (const stmt of splitSql(sql)) {
      try {
        await client.query(stmt);
      } catch (error) {
        fileFailures.push({ statement: stmt.trim().slice(0, 140), error: error.message });
      }
    }
    applied.push(file);
    await client.query("INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [version, file]);
    if (fileFailures.length > 0) failures.push({ file, failures: fileFailures });
    log(`${fileFailures.length ? "applied-with-errors" : "applied"} ${file}`);
  }
  await client.query("GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;");
  await client.query("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;");
  await client.query("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;");
  return { applied, skipped, failures };
}

export async function withClient(fn) {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const cmd = process.argv[2] ?? "migrate";
  const mode = process.argv.includes("--tolerant") ? "tolerant" : "strict";
  withClient(async (client) => {
    if (cmd === "reset" || cmd === "migrate") {
      if (cmd === "reset") await resetDatabase(client);
      const result = await applyMigrations(client, { log: (m) => console.log(m), mode });
      console.log(JSON.stringify({ ok: result.failures.length === 0, applied: result.applied.length, skipped: result.skipped.length, failures: result.failures }));
      if (result.failures.length > 0) process.exitCode = 2;
    } else if (cmd === "schema-hash") {
      // Deterministic hash over the public schema definition (tables, columns,
      // constraints, indexes, policies, functions, triggers, grants).
      const { rows } = await client.query(`
        select string_agg(line, E'\n' order by line) as def from (
          select format('col %s.%s %s %s %s', table_name, column_name, data_type, is_nullable, coalesce(column_default,'')) line from information_schema.columns where table_schema='public'
          union all select format('con %s %s', conrelid::regclass, pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace
          union all select format('idx %s', indexdef) from pg_indexes where schemaname='public'
          union all select format('pol %s %s %s %s %s %s', tablename, policyname, permissive, cmd, coalesce(qual,''), coalesce(with_check,'')) from pg_policies where schemaname='public'
          union all select format('fn %s %s', p.oid::regprocedure, md5(pg_get_functiondef(p.oid))) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
          union all select format('trg %s %s', tgrelid::regclass, pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
          union all select format('rls %s %s %s', relname, relrowsecurity, relforcerowsecurity) from pg_class where relnamespace='public'::regnamespace and relkind='r'
          union all select format('grant %s %s %s', table_name, grantee, privilege_type) from information_schema.role_table_grants where table_schema='public'
        ) s`);
      const { createHash } = await import("node:crypto");
      const def = rows[0]?.def ?? "";
      console.log(JSON.stringify({ hash: createHash("sha256").update(def).digest("hex"), lines: def ? def.split("\n").length : 0 }));
    } else {
      throw new Error(`unknown command ${cmd}`);
    }
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
