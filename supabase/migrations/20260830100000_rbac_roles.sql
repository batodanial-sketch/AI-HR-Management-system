-- Fluxentiq · 20260830100000 — Tenant RBAC roles + row-level guarding
-- ---------------------------------------------------------------------------
-- Canonical RBAC roles: SUPER_ADMIN > HR_ADMIN > MANAGER > EMPLOYEE.
--
--  1. `user_role(org)`       → effective role for the current auth user,
--                              normalized from legacy `memberships.role`
--                              free-text (owner/admin/hr_admin/manager/…)
--                              with the roles-table as fallback.
--  2. `my_employee_id(org)`  → the auth user's own employee row (email match).
--  3. `is_self_or_report(id)`→ true when the row belongs to the caller or a
--                              direct report (manager scope).
--  4. Role-guarded RLS policies on the module tables:
--       - personal-data tables (expense_reports, offboarding_cases,
--         asset_assignments): rows visible/mutable only by self, the direct
--         manager, or HR_ADMIN+.
--       - org-wide tables (benefit_plans, equity_grants, pulse_surveys,
--         workforce_scenarios, assets, documents, contractor_invoices):
--         member-visible, HR_ADMIN+ writes.
--
--  Non-destructive: functions use CREATE OR REPLACE; policies DROP IF EXISTS
--  before re-create. `candidate_ai_assessments` intentionally keeps its
--  tenant_isolation policy (recruiter-role workflows depend on it); the
--  app-layer RBAC on /api/screening remains the enforcement point there.
-- ---------------------------------------------------------------------------

-- ── 1. Effective role for the current user in an organization ──────────────

CREATE OR REPLACE FUNCTION public.user_role(p_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN lower(m.role) LIKE '%owner%' OR lower(m.role) LIKE '%super%' OR lower(m.role) LIKE '%system_admin%'
          THEN 'SUPER_ADMIN'
        WHEN lower(m.role) LIKE '%admin%'
          THEN 'HR_ADMIN'
        WHEN lower(m.role) LIKE '%manager%'
          THEN 'MANAGER'
        ELSE 'EMPLOYEE'
      END
      FROM memberships m
      WHERE m.user_id = auth.uid() AND m.organization_id = p_org
      LIMIT 1
    ),
    (
      SELECT CASE
        WHEN lower(r.code) IN ('owner','super_admin','system_admin') THEN 'SUPER_ADMIN'
        WHEN lower(r.code) LIKE '%admin%' THEN 'HR_ADMIN'
        WHEN lower(r.code) LIKE '%manager%' THEN 'MANAGER'
        ELSE 'EMPLOYEE'
      END
      FROM organization_memberships om
      JOIN roles r ON r.id = om.role_id
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_org
        AND om.status = 'active'
      LIMIT 1
    ),
    'EMPLOYEE'
  );
$$;

-- ── 2. The auth user's own employee row ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_employee_id(p_org uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM employees e
  WHERE e.organization_id = p_org
    AND (
      lower(e.work_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
      OR lower(e.personal_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  LIMIT 1;
$$;

-- ── 3. Row belongs to the caller or one of their direct reports ─────────────

CREATE OR REPLACE FUNCTION public.is_self_or_report(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.id = p_target
      AND (
        e.id = public.my_employee_id(e.organization_id)
        OR e.manager_id = public.my_employee_id(e.organization_id)
      )
  );
$$;

-- ── 4a. Personal-data tables: self / manager / HR ──────────────────────────

-- expense_reports — EMPLOYEE self-only, MANAGER self+reports, HR+ org-wide.
DROP POLICY IF EXISTS tenant_isolation ON public.expense_reports;
CREATE POLICY expense_reports_scope ON public.expense_reports FOR ALL
  USING (
    public.is_organization_member(organization_id)
    AND (
      public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
      OR public.is_self_or_report(employee_id)
    )
  )
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND (
      public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
      OR public.is_self_or_report(employee_id)
    )
  );

-- offboarding_cases — member reads own/team; MANAGER+ may create; HR+ all.
DROP POLICY IF EXISTS tenant_isolation ON public.offboarding_cases;
CREATE POLICY offboarding_cases_scope ON public.offboarding_cases FOR ALL
  USING (
    public.is_organization_member(organization_id)
    AND (
      public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
      OR public.is_self_or_report(employee_id)
    )
  )
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND (
      public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
      OR (
        public.user_role(organization_id) = 'MANAGER'
        AND public.is_self_or_report(employee_id)
      )
    )
  );

-- offboarding_tasks — same team/HR scope as their parent cases.
DROP POLICY IF EXISTS tenant_isolation ON public.offboarding_tasks;
CREATE POLICY offboarding_tasks_scope ON public.offboarding_tasks FOR ALL
  USING (
    public.is_organization_member(organization_id)
    AND (
      public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
      OR public.is_self_or_report(owner_employee_id)
    )
  )
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN', 'MANAGER')
  );

-- asset_assignments — assigned employees see/manage their own assignments.
DROP POLICY IF EXISTS tenant_isolation ON public.asset_assignments;
CREATE POLICY asset_assignments_scope ON public.asset_assignments FOR ALL
  USING (
    public.is_organization_member(organization_id)
    AND (
      public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
      OR public.is_self_or_report(employee_id)
    )
  )
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND (
      public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
      OR (
        public.user_role(organization_id) = 'MANAGER'
        AND public.is_self_or_report(employee_id)
      )
    )
  );

-- ── 4b. Org-wide tables: member-visible, HR_ADMIN+ writes ──────────────────

-- assets — visible to members; only HR_ADMIN+ mutates inventory.
DROP POLICY IF EXISTS tenant_isolation ON public.assets;
CREATE POLICY assets_scope ON public.assets FOR ALL
  USING (public.is_organization_member(organization_id))
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
  );

-- benefit_plans — visible to members; HR_ADMIN+ manages plans.
DROP POLICY IF EXISTS tenant_isolation ON public.benefit_plans;
CREATE POLICY benefit_plans_scope ON public.benefit_plans FOR ALL
  USING (public.is_organization_member(organization_id))
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
  );

-- equity_grants — visible to members; HR_ADMIN+ manages grants.
DROP POLICY IF EXISTS tenant_isolation ON public.equity_grants;
CREATE POLICY equity_grants_scope ON public.equity_grants FOR ALL
  USING (public.is_organization_member(organization_id))
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
  );

-- pulse_surveys — visible to members; HR_ADMIN+ manages surveys.
DROP POLICY IF EXISTS tenant_isolation ON public.pulse_surveys;
CREATE POLICY pulse_surveys_scope ON public.pulse_surveys FOR ALL
  USING (public.is_organization_member(organization_id))
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
  );

-- workforce_scenarios — visible to members; HR_ADMIN+ manages scenarios.
DROP POLICY IF EXISTS tenant_isolation ON public.workforce_scenarios;
CREATE POLICY workforce_scenarios_scope ON public.workforce_scenarios FOR ALL
  USING (public.is_organization_member(organization_id))
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
  );

-- documents — visible to members; HR_ADMIN+ manages documents.
DROP POLICY IF EXISTS tenant_isolation ON public.documents;
CREATE POLICY documents_scope ON public.documents FOR ALL
  USING (public.is_organization_member(organization_id))
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
  );

-- contractor_invoices — visible to members; HR_ADMIN+ manages invoices.
DROP POLICY IF EXISTS tenant_isolation ON public.contractor_invoices;
CREATE POLICY contractor_invoices_scope ON public.contractor_invoices FOR ALL
  USING (public.is_organization_member(organization_id))
  WITH CHECK (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
  );

-- ── Role catalog seed (demo organization only) ─────────────────────────────

DO $$
DECLARE
  demo_org UUID;
BEGIN
  SELECT id INTO demo_org
  FROM public.organizations
  WHERE id = '11111111-1111-4111-8111-111111111111'
     OR slug IN ('demo', 'fluxentiq-demo')
  LIMIT 1;

  IF demo_org IS NULL THEN
    RAISE NOTICE 'rbac_roles: no demo organization found — skipping role seeds';
    RETURN;
  END IF;

  INSERT INTO public.roles (organization_id, code, name, description, is_system, permissions)
  VALUES
    (demo_org, 'super_admin', 'Super Admin', 'Unrestricted org-wide access (owner-equivalent).', TRUE,
     '[{"resource":"*","actions":["*"]}]'::jsonb),
    (demo_org, 'hr_admin', 'HR Admin', 'Full HR module access org-wide.', TRUE,
     '[{"resource":"*","actions":["read","write"]}]'::jsonb),
    (demo_org, 'manager', 'Manager', 'Access to self + direct reports.', TRUE,
     '[{"resource":"team","actions":["read","write"]}]'::jsonb),
    (demo_org, 'employee', 'Employee', 'Personal records only.', TRUE,
     '[{"resource":"self","actions":["read","write"]}]'::jsonb)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'rbac_roles: role catalog ensured for demo org %', demo_org;
END
$$;
