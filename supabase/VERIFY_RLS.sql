-- Fluxentiq · RLS verification + hardening (idempotent — safe to re-run)
-- ---------------------------------------------------------------------------
-- Paste into Supabase SQL Editor and Run. Reports any table with Row Level
-- Security DISABLED, then (re)enables RLS and applies a tenant-isolation
-- policy to every organization-scoped table that is missing one.
--
-- Role model: owner / admin / manager / member (lowercase, on memberships).

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Preflight: list any RLS-disabled tables (informational only).
-- ───────────────────────────────────────────────────────────────────────────
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Helper: is the current auth user a member of a given organization?
--    (null-safe, falls back to auth.uid()).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_organization_member(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = target_org
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Enable RLS + apply tenant isolation to every org-scoped table that is
--    missing a policy. `organization_id` is the tenant discriminator.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tenant_table TEXT;
BEGIN
  FOR tenant_table IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = n.nspname
     AND col.table_name = c.relname
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND col.column_name = 'organization_id'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tenant_table
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I FOR ALL '
        'USING (public.is_organization_member(organization_id)) '
        'WITH CHECK (public.is_organization_member(organization_id))',
        tenant_table
      );
    END IF;
  END LOOP;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Identity tables (profiles, memberships, users) — self-scoped policies.
--    These are read by getCurrentUser() server-side via the service role, and
--    by the browser via the anon key.
-- ───────────────────────────────────────────────────────────────────────────

-- profiles: a user may read/update only their own profile.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- memberships: a user may read their own memberships (and org admins the
-- org's roster — covered by the tenant policy via organization_id).
DROP POLICY IF EXISTS memberships_select_own ON public.memberships;
CREATE POLICY memberships_select_own
  ON public.memberships FOR SELECT
  USING (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Post-verify: should now report ZERO rows (all tables RLS-protected).
-- ───────────────────────────────────────────────────────────────────────────
SELECT c.relname AS still_unprotected
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;
