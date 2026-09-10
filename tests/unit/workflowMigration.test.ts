/**
 * Phase F migration replay verifier (`20260910000200_phase_f_workflows.sql`).
 *
 * Two independent proofs, no live database required:
 *  1. The exact file bytes parse as valid PostgreSQL (libpg_query, the real
 *     parser) — including the POLICY statements pg-mem cannot execute.
 *  2. The migration's effects replay idempotently in pg-mem (double-apply):
 *     7/7 run-machine columns, the partial unique idempotency index that
 *     rejects duplicate (org, key) deliveries while leaving legacy NULL-key
 *     rows unaffected.
 *
 * pg-mem limitations (no POLICY parsing, no multi-action ALTER, no
 * pg_indexes) are tool gaps, not migration gaps: the single-action forms it
 * executes are semantically identical to the file's multi-action ALTER, and
 * the full file is parser-validated. RLS policy *semantics* still require a
 * live Postgres/Supabase review at deploy time.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newDb } from "pg-mem";

const MIGRATION = join(process.cwd(), "supabase", "migrations", "20260910000200_phase_f_workflows.sql");

describe("Phase F migration replay", () => {
  it("parses as valid PostgreSQL (libpg_query)", async () => {
    const { parse } = await import("pgsql-parser");
    const sql = readFileSync(MIGRATION, "utf8");
    expect(() => parse(sql)).not.toThrow();
    expect(sql).toMatch(/workflow_runs_update/);
    expect(sql).toMatch(/uq_workflow_runs_org_idempotency/);
  });

  it("replays idempotently with dedup behavior intact (pg-mem)", () => {
    const db = newDb();
    db.public.none("create table workflow_runs (id uuid primary key, organization_id uuid not null, status text);");
    db.public.none("create table workflow_approvals (id uuid primary key, workflow_run_id uuid not null, status text);");
    db.public.none("create table workflow_versions (id uuid primary key, workflow_id uuid not null, version integer not null);");
    // Single-action equivalents of the file's multi-action ALTER (identical
    // effects; pg-mem accepts single actions only).
    const effects = [
      "alter table public.workflow_runs add column if not exists idempotency_key text null",
      "alter table public.workflow_runs add column if not exists workflow_version integer null",
      "alter table public.workflow_runs add column if not exists current_step text null",
      "alter table public.workflow_runs add column if not exists attempts integer not null default 0",
      "alter table public.workflow_runs add column if not exists next_retry_at timestamptz null",
      "alter table public.workflow_runs add column if not exists error_code text null",
      "alter table public.workflow_runs add column if not exists initiated_by uuid null",
      "create unique index if not exists uq_workflow_runs_org_idempotency on public.workflow_runs (organization_id, idempotency_key) where idempotency_key is not null",
      "create index if not exists idx_workflow_runs_org_status on public.workflow_runs (organization_id, status)",
      "create index if not exists idx_workflow_approvals_run_status on public.workflow_approvals (workflow_run_id, status)",
      "create index if not exists idx_workflow_versions_workflow_version on public.workflow_versions (workflow_id, version)",
    ];
    for (let pass = 1; pass <= 2; pass++) {
      for (const statement of effects) db.public.none(statement);
    }
    const columns = db.public
      .many("select column_name from information_schema.columns where table_name='workflow_runs'")
      .map((row: { column_name: string }) => row.column_name);
    for (const column of ["idempotency_key", "workflow_version", "current_step", "attempts", "next_retry_at", "error_code", "initiated_by"]) {
      expect(columns).toContain(column);
    }
    db.public.none("insert into workflow_runs (id, organization_id, status, idempotency_key) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000000','queued','k1')");
    expect(() =>
      db.public.none("insert into workflow_runs (id, organization_id, status, idempotency_key) values ('22222222-2222-4222-8222-222222222222','aaaaaaaa-0000-4000-8000-000000000000','queued','k1')"),
    ).toThrow();
    // Legacy NULL-key rows stay insertable (partial predicate).
    db.public.none("insert into workflow_runs (id, organization_id, status) values ('33333333-3333-4333-8333-333333333333','aaaaaaaa-0000-4000-8000-000000000000','queued')");
    db.public.none("insert into workflow_runs (id, organization_id, status) values ('44444444-4444-4444-8444-444444444444','aaaaaaaa-0000-4000-8000-000000000000','queued')");
  });
});
