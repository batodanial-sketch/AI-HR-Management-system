-- Fluxentiq · Phase F — durable run machine columns + approval lookup index.
--
-- Activates the Phase F run state machine on the existing `workflow_runs`
-- table (no new tables: steps live in `workflows.actions` JSON with an
-- append-only ledger in `workflow_runs.executed_actions`; approvals and
-- versions reuse the existing `workflow_approvals` / `workflow_versions`
-- tables from 20260814000100_workflow_automations.sql).
--
-- Deliberately NO status CHECK constraint: legacy rows are owned by the
-- external Python bridge (unknown status vocabulary). The machine is
-- enforced in application code for Phase F runs.

alter table public.workflow_runs
  add column if not exists idempotency_key text null,
  add column if not exists workflow_version integer null,
  add column if not exists current_step text null,
  add column if not exists attempts integer not null default 0,
  add column if not exists next_retry_at timestamptz null,
  add column if not exists error_code text null,
  add column if not exists initiated_by uuid null references auth.users (id) on delete set null;

-- Duplicate run/webhook delivery collapses onto one row (legacy rows keep
-- NULL keys and are unaffected by the partial predicate).
create unique index if not exists uq_workflow_runs_org_idempotency
  on public.workflow_runs (organization_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_workflow_runs_org_status
  on public.workflow_runs (organization_id, status);

create index if not exists idx_workflow_approvals_run_status
  on public.workflow_approvals (workflow_run_id, status);

create index if not exists idx_workflow_versions_workflow_version
  on public.workflow_versions (workflow_id, version);

-- Phase F executor advances runs through the session client: allow members
-- to update their org's runs (the state machine is enforced in application
-- code; RLS gates tenancy only — same split as `workflows_all`). No DELETE
-- policy: runs are immutable history and are never deleted.
drop policy if exists workflow_runs_update on public.workflow_runs;
create policy workflow_runs_update on public.workflow_runs
  for update using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
