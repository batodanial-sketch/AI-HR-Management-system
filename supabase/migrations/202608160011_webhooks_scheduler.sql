-- Fluxentiq · 0011 — webhooks, scheduler jobs, and AI usage extension
-- ---------------------------------------------------------------------------

create table if not exists public.webhook_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  url             text not null,
  events          text[] not null default '{}',
  secret          text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.webhook_subscriptions (id) on delete cascade,
  event           text not null,
  status          text not null default 'pending', -- pending | success | failed
  status_code     integer,
  response_body   text,
  attempted_at    timestamptz not null default now()
);

create table if not exists public.scheduled_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  job_type        text not null,          -- trial_expiry | payroll_reminder | report
  payload         jsonb not null default '{}'::jsonb,
  run_at          timestamptz not null,
  status          text not null default 'pending', -- pending | running | completed | failed
  locked_by       text,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_webhook_subs_org on public.webhook_subscriptions (organization_id);
create index if not exists idx_webhook_deliveries_sub on public.webhook_deliveries (subscription_id);
create index if not exists idx_scheduled_jobs_due on public.scheduled_jobs (status, run_at);

alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.scheduled_jobs enable row level security;

create policy webhook_subs_select on public.webhook_subscriptions
  for select using (public.is_org_member(organization_id));
create policy webhook_subs_all on public.webhook_subscriptions
  for all using (public.current_org_role(organization_id) in ('owner', 'admin'))
  with check (public.current_org_role(organization_id) in ('owner', 'admin'));

create policy webhook_deliveries_select on public.webhook_deliveries
  for select using (
    exists (
      select 1 from public.webhook_subscriptions ws
      where ws.id = subscription_id and public.is_org_member(ws.organization_id)
    )
  );

create policy scheduled_jobs_select on public.scheduled_jobs
  for select using (organization_id is null or public.is_org_member(organization_id));
create policy scheduled_jobs_all on public.scheduled_jobs
  for all using (public.current_org_role(organization_id) in ('owner', 'admin'))
  with check (public.current_org_role(organization_id) in ('owner', 'admin'));
