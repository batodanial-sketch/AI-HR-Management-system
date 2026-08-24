-- Fluxentiq · 0007 — visual automation workflows + execution audit

create table if not exists public.workflows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  trigger_event   text not null,
  status          text not null default 'active', -- active | paused
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.workflow_nodes (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references public.workflows (id) on delete cascade,
  type          workflow_node_type not null default 'action',
  label         text not null,
  position      integer not null default 0,
  config        jsonb not null default '{}'::jsonb
);

create table if not exists public.workflow_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  workflow_id      uuid references public.workflows (id) on delete set null,
  event            text not null,
  status           workflow_run_status not null default 'no_workflow',
  executed_actions jsonb not null default '[]'::jsonb,
  error            text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_workflows_org on public.workflows (organization_id);
create index if not exists idx_workflow_nodes_workflow on public.workflow_nodes (workflow_id);
create index if not exists idx_workflow_runs_org on public.workflow_runs (organization_id);

alter table public.workflows enable row level security;
alter table public.workflow_nodes enable row level security;
alter table public.workflow_runs enable row level security;

create policy workflows_select on public.workflows
  for select using (public.is_org_member(organization_id));
create policy workflows_all on public.workflows
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy workflow_nodes_select on public.workflow_nodes
  for select using (
    exists (select 1 from public.workflows w where w.id = workflow_id and public.is_org_member(w.organization_id))
  );
create policy workflow_nodes_all on public.workflow_nodes
  for all using (
    exists (select 1 from public.workflows w where w.id = workflow_id and public.is_org_member(w.organization_id))
  ) with check (
    exists (select 1 from public.workflows w where w.id = workflow_id and public.is_org_member(w.organization_id))
  );

create policy workflow_runs_select on public.workflow_runs
  for select using (public.is_org_member(organization_id));
create policy workflow_runs_insert on public.workflow_runs
  for insert with check (public.is_org_member(organization_id));

drop trigger if exists workflows_updated_at on public.workflows;
create trigger workflows_updated_at
  before update on public.workflows
  for each row execute procedure public.set_updated_at();
