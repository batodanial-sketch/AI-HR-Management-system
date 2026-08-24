-- Fluxentiq · 0002 — organizations, profiles, memberships, Google Workspace access
-- ---------------------------------------------------------------------------
-- Multi-tenancy foundation. `profiles` are 1:1 with auth.users (auto-created by
-- trigger); `memberships` join users to organizations with a role. The
-- workspace_domains / workspace_memberships / workspace_invites / access_requests
-- tables implement the Google Workspace provisioning rules (decision paths:
-- existing_membership_allowed, invited_membership_activated, membership_required,
-- domain_not_provisioned, personal_account_blocked, ambiguous_domain_blocked).

create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique,
  plan          org_plan not null default 'free',
  billing_status text not null default 'trialing',
  logo_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  avatar_url text,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role            org_role not null default 'member',
  created_at      timestamptz not null default now(),
  unique (user_id, organization_id)
);

-- ── Google Workspace provisioning ───────────────────────────────────────────
create table if not exists public.workspace_domains (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references public.organizations (id) on delete cascade,
  domain              text not null unique,
  provisioning_status provisioning_status not null default 'not_provisioned',
  membership_policy   membership_policy not null default 'require_membership',
  allow_personal_accounts boolean not null default false,
  source_tag          text,
  created_at          timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  email           text not null,
  domain          text not null,
  role            text not null default 'member',
  source_tag      text,
  created_at      timestamptz not null default now()
);

create table if not exists public.workspace_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  email           text not null,
  domain          text not null,
  status          text not null default 'pending', -- pending | activated
  source_tag      text,
  created_at      timestamptz not null default now()
);

create table if not exists public.access_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  email           text not null,
  domain          text not null,
  status          access_request_status not null default 'pending',
  token           text,
  source_tag      text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_memberships_user on public.memberships (user_id);
create index if not exists idx_memberships_org on public.memberships (organization_id);
create index if not exists idx_access_requests_email on public.access_requests (email);

-- ── RLS helpers ─────────────────────────────────────────────────────────────
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and organization_id = org_id
  );
$$;

create or replace function public.current_org_role(org_id uuid)
returns org_role
language sql stable security definer set search_path = public
as $$
  select role from public.memberships
  where user_id = auth.uid() and organization_id = org_id
  limit 1;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.workspace_domains enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.access_requests enable row level security;

create policy org_select on public.organizations
  for select using (public.is_org_member(id));
create policy org_update on public.organizations
  for update using (public.current_org_role(id) in ('owner', 'admin'));

create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());
create policy profiles_select_org on public.profiles
  for select using (
    exists (
      select 1 from public.memberships a
      join public.memberships b on a.organization_id = b.organization_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

create policy memberships_select on public.memberships
  for select using (public.is_org_member(organization_id) or user_id = auth.uid());
create policy memberships_insert on public.memberships
  for insert with check (public.current_org_role(organization_id) in ('owner', 'admin'));
create policy memberships_delete on public.memberships
  for delete using (public.current_org_role(organization_id) in ('owner', 'admin'));

create policy ws_domains_select on public.workspace_domains
  for select using (public.is_org_member(organization_id));
create policy ws_domains_all on public.workspace_domains
  for all using (public.current_org_role(organization_id) in ('owner', 'admin'))
  with check (public.current_org_role(organization_id) in ('owner', 'admin'));

create policy ws_memberships_select on public.workspace_memberships
  for select using (public.is_org_member(organization_id));
create policy ws_invites_select on public.workspace_invites
  for select using (public.is_org_member(organization_id));
create policy access_requests_select on public.access_requests
  for select using (public.is_org_member(organization_id));

-- ── Trigger: auto-create profile on signup ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at trigger helper (reused across tables)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at
  before update on public.organizations
  for each row execute procedure public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
