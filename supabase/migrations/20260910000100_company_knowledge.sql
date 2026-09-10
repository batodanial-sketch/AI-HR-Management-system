-- Fluxentiq · company knowledge base (tenant-scoped handbook / policy / FAQ entries)
--
-- Product evolution (Phase E): durable organization knowledge that grounds AI
-- answers. Retrieval ranks entries by keyword relevance in the app layer
-- (`lib/knowledge/search.ts`); pgvector embeddings remain an explicit future
-- upgrade (no fake similarity scores — keyword relevance only).
--
-- RLS follows the recruitment-table precedent: membership for read/write,
-- owner/admin for delete. App-layer gates: read = any member, write =
-- HR_ADMIN+ (see /api/knowledge/*).

create table if not exists public.company_knowledge (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null check (char_length(title) between 2 and 240),
  content         text not null check (char_length(content) between 10 and 20000),
  source          text not null default 'manual', -- manual | document | policy | faq
  tags            text[] not null default '{}',
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_company_knowledge_org on public.company_knowledge (organization_id);
create index if not exists idx_company_knowledge_updated on public.company_knowledge (organization_id, updated_at desc);

alter table public.company_knowledge enable row level security;

drop policy if exists company_knowledge_select on public.company_knowledge;
create policy company_knowledge_select on public.company_knowledge
  for select using (public.is_org_member(organization_id));

drop policy if exists company_knowledge_insert on public.company_knowledge;
create policy company_knowledge_insert on public.company_knowledge
  for insert with check (public.is_org_member(organization_id));

drop policy if exists company_knowledge_update on public.company_knowledge;
create policy company_knowledge_update on public.company_knowledge
  for update using (public.is_org_member(organization_id));

drop policy if exists company_knowledge_delete on public.company_knowledge;
create policy company_knowledge_delete on public.company_knowledge
  for delete using (public.current_org_role(organization_id) in ('owner', 'admin'));
