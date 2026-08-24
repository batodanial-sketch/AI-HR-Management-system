-- Fluxentiq · RLS for ai_insights, memberships, raw_health_data, user_invoices
-- ---------------------------------------------------------------------------
-- Corrected against the LIVE column types (verified via PostgREST introspection
-- on project zeroaswkxyvcsoxtiyqs). Idempotent — safe to re-run.
--
-- The 42703 (undefined column) error came from policies referencing ownership
-- columns that either don't exist or have the wrong type on these tables. This
-- script uses the ACTUAL columns:

--   ai_insights      user_id  TEXT   (no organization_id)
--   memberships      user_id  UUID   + organization_id UUID
--   raw_health_data  user_id  TEXT   (no organization_id)
--   user_invoices    email    TEXT   (NO user_id, NO organization_id)

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Guard: helper functions (SECURITY DEFINER, bypass RLS on memberships so
--    the policies below never recurse).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_organization_member(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = target_organization_id
  );
$$;

CREATE OR REPLACE FUNCTION public.current_org_role(target_organization_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.role FROM public.memberships m
  WHERE m.user_id = auth.uid()
    AND m.organization_id = target_organization_id
  LIMIT 1;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ai_insights — owned by user_id (TEXT). No organization_id.
--    NOTE: user_id is TEXT, so auth.uid() (uuid) must be cast to text.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insights_own ON public.ai_insights;
CREATE POLICY ai_insights_own
  ON public.ai_insights
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. raw_health_data — owned by user_id (TEXT). No organization_id.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.raw_health_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raw_health_data_own ON public.raw_health_data;
CREATE POLICY raw_health_data_own
  ON public.raw_health_data
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. memberships — a user reads their OWN membership; any org member reads
--    the org roster. Writes (invite/role changes) restricted to owner/admin.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_select_own ON public.memberships;
CREATE POLICY memberships_select_own
  ON public.memberships
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_organization_member(organization_id)
  );

DROP POLICY IF EXISTS memberships_write ON public.memberships;
CREATE POLICY memberships_write
  ON public.memberships
  FOR ALL
  USING (current_org_role(organization_id) IN ('owner', 'admin'))
  WITH CHECK (current_org_role(organization_id) IN ('owner', 'admin'));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. user_invoices — has NO user_id and NO organization_id; the only ownership
--    signal is the `email` column. Policy scopes rows to the authenticated
--    user's email (case-insensitive).
--
--    ⚠️ CAVEAT: `email` here is the invoice's billing email. If it is NOT
--    guaranteed to equal the owning account's email, prefer the schema-fix in
--    the comment block below (add a real `user_id uuid` column) instead.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invoices_own ON public.user_invoices;
CREATE POLICY user_invoices_own
  ON public.user_invoices
  FOR ALL
  USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  WITH CHECK (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ───────────────────────────────────────────────────────────────────────────
-- RECOMMENDED (optional) — if `user_invoices.email` is the CLIENT's email,
-- add a true owner column instead of overloading email:
--
--   ALTER TABLE public.user_invoices ADD COLUMN IF NOT EXISTS user_id uuid;
--   -- backfill: UPDATE public.user_invoices SET user_id = <owner> WHERE ...;
--   DROP POLICY IF EXISTS user_invoices_own ON public.user_invoices;
--   CREATE POLICY user_invoices_own ON public.user_invoices
--     FOR ALL
--     USING (user_id = auth.uid())
--     WITH CHECK (user_id = auth.uid());
-- ───────────────────────────────────────────────────────────────────────────
