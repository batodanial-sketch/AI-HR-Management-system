-- Fluxentiq · AUTH_TENANT_HARDENING — per-user tenant provisioning + RLS audit
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL Editor. Idempotent (CREATE OR REPLACE / IF NOT
-- EXISTS). Addresses cross-tenant leakage in the signup path.
--
-- WHY:
--   The previous `handle_new_user` trigger attached EVERY new signup to the
--   FIRST existing organization (`ORDER BY created_at LIMIT 1`). On any
--   multi-tenant deployment that means a brand-new account would be granted a
--   `member` membership in another tenant's organization — leaking their data
--   through the tenant-scoped RLS policies.
--
-- FIX:
--   Each new account now provisions its OWN organization with an `owner`
--   membership. Cross-org membership (adding an employee to an existing
--   workspace) is granted EXPLICITLY via the app's invite flow
--   (`addMemberByEmail`), never implicitly at signup.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Per-user tenant provisioning (replaces auto-join-to-first-org)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org_name TEXT := COALESCE(
    NEW.raw_user_meta_data ->> 'organization_name',
    COALESCE(NULLIF(NEW.email, ''), 'Workspace')
  );
  org_slug TEXT := lower(
    regexp_replace(COALESCE(NULLIF(NEW.email, ''), 'user'), '[^a-z0-9]+', '-', 'g')
    || '-' || substring(NEW.id::text, 1, 8)
  );
  new_org_id UUID;
BEGIN
  -- Legacy identity rows (profiles.id FK → users.id).
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Provision the user's OWN tenant. Never attach to an existing org.
  INSERT INTO public.organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;

  INSERT INTO public.memberships (user_id, organization_id, role)
  VALUES (NEW.id, new_org_id, 'owner')
  ON CONFLICT (user_id, organization_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RLS — tenant isolation is ALREADY enforced via `is_organization_member`
--    (query-matched on `memberships` where user_id = auth.uid()). This is the
--    authoritative, refresh-safe approach: it re-reads membership on every
--    query, so it works immediately for a brand-new session with no dependency
--    on JWT claim staleness.
--
--    The following OPTIONAL policy demonstrates the app_metadata-claim form
--    for tables you want to lock to a single pinned tenant. NOTE: the JWT
--    claim only refreshes on the user's NEXT sign-in (Supabase does not re-sign
--    in-flight JWTs when app_metadata changes), so keep `is_organization_member`
--    as the primary policy and treat this as defense-in-depth where used.
-- ───────────────────────────────────────────────────────────────────────────
-- (Optional, opt-in per table — uncomment and pick a table to enable:)
-- CREATE POLICY tenant_claim_isolation ON public.employees
--   FOR ALL
--   USING (
--     organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
--   )
--   WITH CHECK (
--     organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
--   );

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Verification — should report ZERO rows (every org-scoped table is RLS-on)
-- ───────────────────────────────────────────────────────────────────────────
SELECT c.relname AS unprotected_table
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Sanity: confirm no membership exists with an org that the user does NOT
--    own/join — every membership row should resolve to a real user + org.
-- ───────────────────────────────────────────────────────────────────────────
SELECT m.user_id, m.organization_id, m.role
FROM public.memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
LEFT JOIN public.organizations o ON o.id = m.organization_id
WHERE u.id IS NULL OR o.id IS NULL;
