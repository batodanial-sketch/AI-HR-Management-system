-- Fluxentiq · 0006 — global payroll engine

create table if not exists public.payroll_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  status           payroll_run_status not null default 'draft',
  currency         text not null default 'USD',
  total_gross      numeric not null default 0,
  total_deductions numeric not null default 0,
  total_net        numeric not null default 0,
  executed_by      uuid references auth.users (id) on delete set null,
  executed_at      timestamptz,
  source_tag       text,
  created_at       timestamptz not null default now()
);

create table if not exists public.payroll_line_items (
  id              uuid primary key default gen_random_uuid(),
  payroll_run_id  uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id     uuid not null references public.employees (id) on delete cascade,
  employee_name   text,
  gross_pay       numeric not null default 0,
  deductions      numeric not null default 0,
  net_pay         numeric not null default 0,
  currency        text not null default 'USD',
  source_tag      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_payroll_runs_org on public.payroll_runs (organization_id);
create index if not exists idx_payroll_lines_run on public.payroll_line_items (payroll_run_id);

alter table public.payroll_runs enable row level security;
alter table public.payroll_line_items enable row level security;

create policy payroll_runs_select on public.payroll_runs
  for select using (public.is_org_member(organization_id));
create policy payroll_runs_insert on public.payroll_runs
  for insert with check (public.current_org_role(organization_id) in ('owner', 'admin'));
create policy payroll_runs_update on public.payroll_runs
  for update using (public.current_org_role(organization_id) in ('owner', 'admin'));

create policy payroll_lines_select on public.payroll_line_items
  for select using (
    exists (
      select 1 from public.payroll_runs r
      where r.id = payroll_run_id and public.is_org_member(r.organization_id)
    )
  );
create policy payroll_lines_insert on public.payroll_line_items
  for insert with check (
    exists (
      select 1 from public.payroll_runs r
      where r.id = payroll_run_id and public.current_org_role(r.organization_id) in ('owner', 'admin')
    )
  );
