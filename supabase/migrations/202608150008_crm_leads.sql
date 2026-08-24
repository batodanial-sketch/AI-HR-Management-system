-- Fluxentiq · 0008 — lead intelligence (CRM)

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  email           text not null,
  company         text,
  title           text,
  source          text,
  status          lead_status not null default 'new',
  score           integer not null default 0 check (score between 0 and 100),
  owner_id        uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists public.lead_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  kind       text not null default 'note', -- note | call | email | meeting
  note       text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  lead_id             uuid references public.leads (id) on delete set null,
  name                text not null,
  value               numeric not null default 0,
  currency            text not null default 'USD',
  stage               deal_stage not null default 'discovery',
  probability         integer not null default 20 check (probability between 0 and 100),
  expected_close_date date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_leads_org on public.leads (organization_id);
create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_deals_org on public.deals (organization_id);
create index if not exists idx_lead_activities_lead on public.lead_activities (lead_id);

alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.deals enable row level security;

create policy leads_select on public.leads
  for select using (public.is_org_member(organization_id));
create policy leads_insert on public.leads
  for insert with check (public.is_org_member(organization_id));
create policy leads_update on public.leads
  for update using (public.is_org_member(organization_id));
create policy leads_delete on public.leads
  for delete using (public.current_org_role(organization_id) in ('owner', 'admin'));

create policy lead_activities_select on public.lead_activities
  for select using (
    exists (select 1 from public.leads l where l.id = lead_id and public.is_org_member(l.organization_id))
  );
create policy lead_activities_insert on public.lead_activities
  for insert with check (
    exists (select 1 from public.leads l where l.id = lead_id and public.is_org_member(l.organization_id))
  );

create policy deals_select on public.deals
  for select using (public.is_org_member(organization_id));
create policy deals_insert on public.deals
  for insert with check (public.is_org_member(organization_id));
create policy deals_update on public.deals
  for update using (public.is_org_member(organization_id));

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
  before update on public.leads
  for each row execute procedure public.set_updated_at();

drop trigger if exists deals_updated_at on public.deals;
create trigger deals_updated_at
  before update on public.deals
  for each row execute procedure public.set_updated_at();
