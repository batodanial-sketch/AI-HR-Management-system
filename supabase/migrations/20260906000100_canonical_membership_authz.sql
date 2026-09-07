-- Fluxentiq · 20260906000100 — Phase R1: canonical membership authorization
-- ---------------------------------------------------------------------------
-- Unifies every database-side role/membership resolution around ONE source:
--
--     public.memberships (user_id, organization_id, role org_role)
--
-- Before this migration the database carried two role models:
--   1. memberships.role                                   (org_role enum)
--   2. organization_memberships.role_id → roles.code       (legacy)
-- and the RLS helpers disagreed about which one they consulted:
--   - is_organization_member()  → organization_memberships  (initial migration)
--   - is_org_member()           → memberships
--   - user_role()               → memberships, THEN organization_memberships,
--                                 THEN a silent default of 'EMPLOYEE'
--   - bootstrap_organization()  → wrote organization_memberships + roles
--   - scim_*()                  → read/wrote organization_memberships + roles
--
-- After this migration:
--   - every helper reads `memberships` only;
--   - `user_role()` returns NULL (→ every role-guarded policy denies) when the
--     caller has no membership or the stored role is not a canonical code —
--     there is no default tier;
--   - provisioning paths (bootstrap, SCIM) write `memberships` only;
--   - `organization_memberships` / `roles` are no longer consulted for any
--     authorization decision. They are left in place (non-destructive) but
--     reduced to read-only for non-service roles.
--
-- Idempotent: CREATE OR REPLACE / DROP POLICY IF EXISTS throughout.
-- ---------------------------------------------------------------------------

-- ── 0. Canonical membership integrity ──────────────────────────────────────
-- `memberships.role` is the `org_role` enum in the canonical migration, but
-- the go-live scripts created it as free TEXT on some live databases. Enforce
-- the canonical vocabulary either way so an unknown role can never be stored.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'memberships'
      AND column_name = 'role' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_role_canonical;
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_role_canonical
      CHECK (role IN ('owner', 'admin', 'manager', 'member'));
  END IF;
END
$$;

-- Exactly one membership per (user, organization) — required for the
-- application resolver's "ambiguous membership" semantics to be meaningful.
CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_org_unique
  ON public.memberships (user_id, organization_id);

-- ── 1. Tenant membership predicate (canonical) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.is_organization_member(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = target_organization_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_organization_member(org_id);
$$;

-- ── 2. Canonical role code for the caller in an organization ───────────────
-- `current_org_role()` already reads `memberships` in every prior definition
-- (0002 returns org_role; the go-live script returns TEXT). Its return type
-- cannot be changed in place without cascading to dependent policies, so it
-- is only created when missing. Either variant compares correctly against the
-- canonical text literals used by the policies.
DO $$
BEGIN
  IF to_regprocedure('public.current_org_role(uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.current_org_role(org_id UUID)
      RETURNS TEXT
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $body$
        SELECT m.role::text FROM public.memberships m
        WHERE m.user_id = auth.uid() AND m.organization_id = org_id
        LIMIT 1;
      $body$
    $fn$;
  END IF;
END
$$;

-- ── 3. RBAC tier for the caller (fail closed) ──────────────────────────────
-- The ONLY canonical-code → tier mapping in the database. Mirrors
-- lib/authz/model.ts ROLE_CODE_TO_TIER exactly. Any other value → NULL, and
-- `NULL IN (...)` is never true, so every role-guarded policy denies.
CREATE OR REPLACE FUNCTION public.user_role(p_org UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE m.role::text
           WHEN 'owner'   THEN 'SUPER_ADMIN'
           WHEN 'admin'   THEN 'HR_ADMIN'
           WHEN 'manager' THEN 'MANAGER'
           WHEN 'member'  THEN 'EMPLOYEE'
           ELSE NULL
         END
  FROM public.memberships m
  WHERE m.user_id = auth.uid()
    AND m.organization_id = p_org
  LIMIT 1;
$$;

-- ── 4. Workspace bootstrap → canonical membership ──────────────────────────
CREATE OR REPLACE FUNCTION public.bootstrap_organization(
  workspace_name TEXT,
  workspace_slug TEXT
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  role_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_user_id UUID := auth.uid();
  normalized_name TEXT := btrim(workspace_name);
  normalized_slug TEXT := lower(btrim(workspace_slug));
  created_organization_id UUID;
BEGIN
  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to bootstrap a workspace.';
  END IF;

  IF char_length(normalized_name) < 2 OR char_length(normalized_name) > 180 THEN
    RAISE EXCEPTION 'Workspace name must contain between 2 and 180 characters.';
  END IF;

  IF normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length(normalized_slug) > 80 THEN
    RAISE EXCEPTION 'Workspace slug must use lowercase letters, numbers, and single hyphens only.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = caller_user_id) THEN
    RAISE EXCEPTION 'The current user already has an active organization membership.';
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (normalized_name, normalized_slug)
  RETURNING id INTO created_organization_id;

  INSERT INTO public.memberships (user_id, organization_id, role)
  VALUES (caller_user_id, created_organization_id, 'owner');

  RETURN QUERY
  SELECT created_organization_id, normalized_name, normalized_slug, 'owner'::TEXT;
END;
$$;

-- ── 5. SCIM helpers → canonical membership ─────────────────────────────────
-- Assign/update the canonical membership. `p_active = false` REVOKES (deletes)
-- the membership: there is no "inactive but present" state in the canonical
-- model, so a deprovisioned user fails closed everywhere immediately.
CREATE OR REPLACE FUNCTION public.scim_assign_membership(
    p_org uuid,
    p_user uuid,
    p_role_code text,
    p_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_membership_id uuid;
BEGIN
    IF p_role_code IS NULL OR lower(p_role_code) NOT IN ('owner', 'admin', 'manager', 'member') THEN
        RAISE EXCEPTION 'scim_assign_membership: % is not a canonical role code', p_role_code;
    END IF;

    IF NOT p_active THEN
        DELETE FROM public.memberships
        WHERE user_id = p_user AND organization_id = p_org
        RETURNING id INTO v_membership_id;
        RETURN v_membership_id;
    END IF;

    INSERT INTO public.memberships (user_id, organization_id, role)
    VALUES (p_user, p_org, lower(p_role_code)::org_role)
    ON CONFLICT (user_id, organization_id)
      DO UPDATE SET role = EXCLUDED.role
    RETURNING id INTO v_membership_id;

    RETURN v_membership_id;
END
$$;

CREATE OR REPLACE FUNCTION public.scim_list_memberships(p_org uuid)
RETURNS TABLE (
    user_id uuid,
    email text,
    role_code text,
    active boolean,
    scim_external_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
      m.user_id,
      u.email::text,
      m.role::text,
      true,
      (u.raw_user_meta_data ->> 'scim_external_id')::text
  FROM public.memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_org
  ORDER BY u.email ASC;
$$;

-- ── 6. Canonical table RLS: writes are HR_ADMIN+ only, reads are tenant-scoped
-- (Re-declared here so the policy set is complete regardless of which
-- go-live script created the table.)
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_select ON public.memberships;
CREATE POLICY memberships_select ON public.memberships
  FOR SELECT USING (public.is_organization_member(organization_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS memberships_insert ON public.memberships;
CREATE POLICY memberships_insert ON public.memberships
  FOR INSERT WITH CHECK (public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN'));

DROP POLICY IF EXISTS memberships_update ON public.memberships;
CREATE POLICY memberships_update ON public.memberships
  FOR UPDATE
  USING (public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN'))
  WITH CHECK (public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN'));

DROP POLICY IF EXISTS memberships_delete ON public.memberships;
CREATE POLICY memberships_delete ON public.memberships
  FOR DELETE USING (public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN'));

-- ── 7. Legacy role model: no longer authoritative ──────────────────────────
-- Keep the tables (non-destructive) but ensure they cannot be used to mint
-- authority: no client-side writes, tenant-scoped reads only.
DO $$
BEGIN
  IF to_regclass('public.organization_memberships') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.organization_memberships';
    EXECUTE 'DROP POLICY IF EXISTS memberships_select_self_or_org_member ON public.organization_memberships';
    EXECUTE 'CREATE POLICY legacy_org_memberships_read_only ON public.organization_memberships FOR SELECT USING (user_id = auth.uid() OR public.is_organization_member(organization_id))';
    COMMENT ON TABLE public.organization_memberships IS
      'LEGACY — not authoritative. Canonical membership/role lives in public.memberships (Phase R1).';
  END IF;
  IF to_regclass('public.roles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.roles';
    EXECUTE 'CREATE POLICY legacy_roles_read_only ON public.roles FOR SELECT USING (organization_id IS NULL OR public.is_organization_member(organization_id))';
    COMMENT ON TABLE public.roles IS
      'LEGACY — not authoritative. Canonical role code lives in public.memberships.role (Phase R1).';
  END IF;
END
$$;

-- ── 8. Approval decisions are role-guarded at the database layer ───────────
-- `leave_requests` previously carried only tenant-membership policies
-- (permissive, OR-combined), so any member of the tenant could move a request
-- out of `pending` directly. Decisions (approve/reject) are MANAGER+ in the
-- application; enforce the same at the row level with a RESTRICTIVE policy
-- (AND-combined with the permissive tenant policies) so authorization is
-- re-evaluated at execution time regardless of what happened earlier in the
-- lifecycle. Employees may still edit their own request while it is pending.
DROP POLICY IF EXISTS leave_requests_decision_role_guard ON public.leave_requests;
CREATE POLICY leave_requests_decision_role_guard ON public.leave_requests
  AS RESTRICTIVE
  FOR UPDATE
  USING (public.is_organization_member(organization_id))
  WITH CHECK (
    status = 'pending'
    OR public.user_role(organization_id) IN ('MANAGER', 'HR_ADMIN', 'SUPER_ADMIN')
  );
