-- Fluxentiq · 0009 — notifications, audit log, AI usage metering

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete cascade,
  kind            notification_kind not null default 'info',
  title           text not null,
  description     text,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid references auth.users (id) on delete set null,
  action          text not null,
  entity          text not null,
  entity_id       text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature         text not null, -- candidate_evaluation | copilot | pto_evaluation | workflow
  model           text,
  tokens_in       integer not null default 0,
  tokens_out      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id);
create index if not exists idx_audit_org on public.audit_logs (organization_id);
create index if not exists idx_ai_usage_org on public.ai_usage (organization_id);

alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_usage enable row level security;

create policy notifications_select on public.notifications
  for select using (user_id = auth.uid() or public.is_org_member(organization_id));
create policy notifications_insert on public.notifications
  for insert with check (public.is_org_member(organization_id));
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid());

create policy audit_logs_select on public.audit_logs
  for select using (public.is_org_member(organization_id));
create policy audit_logs_insert on public.audit_logs
  for insert with check (public.is_org_member(organization_id));

create policy ai_usage_select on public.ai_usage
  for select using (public.current_org_role(organization_id) in ('owner', 'admin'));
create policy ai_usage_insert on public.ai_usage
  for insert with check (public.is_org_member(organization_id));
