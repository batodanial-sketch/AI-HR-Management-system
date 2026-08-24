-- Fluxentiq · 0010 — dashboard metrics cache

create table if not exists public.dashboard_metrics (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key             text not null, -- headcount | payroll | pto | open_roles
  label           text not null,
  value           numeric not null default 0,
  delta           numeric not null default 0,
  delta_label     text,
  spark           integer[] not null default '{}',
  format          text not null default 'number', -- number | currency | percent
  currency        text,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, key)
);

alter table public.dashboard_metrics enable row level security;

create policy dashboard_metrics_select on public.dashboard_metrics
  for select using (public.is_org_member(organization_id));
create policy dashboard_metrics_all on public.dashboard_metrics
  for all using (public.current_org_role(organization_id) in ('owner', 'admin'))
  with check (public.current_org_role(organization_id) in ('owner', 'admin'));
