-- Fluxentiq · 0004 — recruitment (job postings, candidates, AI evaluations)

create table if not exists public.job_postings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null,
  department      text,
  location        text,
  status          text not null default 'open', -- open | closed | paused
  description     text,
  source_tag      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.candidates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_posting_id  uuid references public.job_postings (id) on delete set null,
  first_name      text not null,
  last_name       text not null,
  email           text not null,
  role            text,
  stage           recruitment_stage not null default 'applied',
  match_score     integer not null default 0 check (match_score between 0 and 100),
  source          text,
  resume_url      text,
  source_tag      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.candidate_evaluations (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates (id) on delete cascade,
  score          integer not null check (score between 0 and 100),
  summary        text,
  recommendation recommendation not null default 'hold',
  model          text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_candidates_org on public.candidates (organization_id);
create index if not exists idx_candidates_stage on public.candidates (stage);
create index if not exists idx_job_postings_org on public.job_postings (organization_id);
create index if not exists idx_candidate_eval_candidate on public.candidate_evaluations (candidate_id);

alter table public.job_postings enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_evaluations enable row level security;

create policy job_postings_select on public.job_postings
  for select using (public.is_org_member(organization_id));
create policy job_postings_insert on public.job_postings
  for insert with check (public.is_org_member(organization_id));
create policy job_postings_update on public.job_postings
  for update using (public.is_org_member(organization_id));
create policy job_postings_delete on public.job_postings
  for delete using (public.current_org_role(organization_id) in ('owner', 'admin'));

create policy candidates_select on public.candidates
  for select using (public.is_org_member(organization_id));
create policy candidates_insert on public.candidates
  for insert with check (public.is_org_member(organization_id));
create policy candidates_update on public.candidates
  for update using (public.is_org_member(organization_id));
create policy candidates_delete on public.candidates
  for delete using (public.current_org_role(organization_id) in ('owner', 'admin'));

create policy candidate_evals_select on public.candidate_evaluations
  for select using (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and public.is_org_member(c.organization_id)
    )
  );
create policy candidate_evals_insert on public.candidate_evaluations
  for insert with check (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and public.is_org_member(c.organization_id)
    )
  );

drop trigger if exists candidates_updated_at on public.candidates;
create trigger candidates_updated_at
  before update on public.candidates
  for each row execute procedure public.set_updated_at();
