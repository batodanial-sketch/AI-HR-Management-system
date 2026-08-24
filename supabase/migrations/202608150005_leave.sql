-- Fluxentiq · 0005 — attendance & leave

create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id     uuid not null references public.employees (id) on delete cascade,
  employee_name   text,
  type            leave_type not null default 'pto',
  start_date      date not null,
  end_date        date not null,
  reason          text,
  status          leave_status not null default 'pending',
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  source_tag      text,
  created_at      timestamptz not null default now()
);

create table if not exists public.leave_balances (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  type         leave_type not null,
  balance_days numeric not null default 0,
  used_days    numeric not null default 0,
  year         integer not null default date_part('year', now()),
  source_tag   text,
  unique (employee_id, type, year)
);

create index if not exists idx_leave_requests_org on public.leave_requests (organization_id);
create index if not exists idx_leave_requests_employee on public.leave_requests (employee_id);

alter table public.leave_requests enable row level security;
alter table public.leave_balances enable row level security;

create policy leave_requests_select on public.leave_requests
  for select using (public.is_org_member(organization_id));
create policy leave_requests_insert on public.leave_requests
  for insert with check (public.is_org_member(organization_id));
create policy leave_requests_update on public.leave_requests
  for update using (
    public.is_org_member(organization_id)
    and (
      public.current_org_role(organization_id) in ('owner', 'admin', 'manager')
      or employee_id = (select id from public.employees where email = (select email from auth.users where id = auth.uid()) limit 1)
    )
  );

create policy leave_balances_select on public.leave_balances
  for select using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id and public.is_org_member(e.organization_id)
    )
  );
create policy leave_balances_insert on public.leave_balances
  for insert with check (
    exists (
      select 1 from public.employees e
      where e.id = employee_id and public.current_org_role(e.organization_id) in ('owner', 'admin')
    )
  );
create policy leave_balances_update on public.leave_balances
  for update using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id and public.current_org_role(e.organization_id) in ('owner', 'admin')
    )
  );
