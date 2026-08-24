-- Fluxentiq benefits, equity, and compensation extension.

CREATE TABLE IF NOT EXISTS public.benefit_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, provider TEXT, plan_type TEXT NOT NULL, description TEXT,
  employee_cost NUMERIC(14,2) NOT NULL DEFAULT 0, employer_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD', enrollment_start DATE, enrollment_end DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE TABLE IF NOT EXISTS public.benefit_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  benefit_plan_id UUID NOT NULL REFERENCES public.benefit_plans(id) ON DELETE CASCADE, employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('pending','enrolled','waived','cancelled')),
  effective_date DATE, ended_at DATE, selected_coverage JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (benefit_plan_id, employee_id)
);
CREATE TABLE IF NOT EXISTS public.benefit_dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  benefit_enrollment_id UUID NOT NULL REFERENCES public.benefit_enrollments(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, relationship TEXT NOT NULL, date_of_birth DATE, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.equity_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE, grant_type TEXT NOT NULL CHECK (grant_type IN ('option','rsu','share','phantom')),
  grant_date DATE NOT NULL, quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0), strike_price NUMERIC(14,4), currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  vesting_start_date DATE NOT NULL, vesting_end_date DATE, cliff_months INTEGER NOT NULL DEFAULT 0 CHECK (cliff_months >= 0), vesting_months INTEGER NOT NULL DEFAULT 48 CHECK (vesting_months > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','exercised','cancelled','expired')), metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.equity_vesting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  equity_grant_id UUID NOT NULL REFERENCES public.equity_grants(id) ON DELETE CASCADE, vesting_date DATE NOT NULL, quantity NUMERIC(18,4) NOT NULL CHECK (quantity >= 0), status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','vested','cancelled')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (equity_grant_id, vesting_date)
);
CREATE TABLE IF NOT EXISTS public.compensation_bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_title_id UUID REFERENCES public.job_titles(id) ON DELETE SET NULL, name TEXT NOT NULL, level TEXT, currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  min_salary NUMERIC(14,2) NOT NULL, midpoint_salary NUMERIC(14,2) NOT NULL, max_salary NUMERIC(14,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (min_salary <= midpoint_salary AND midpoint_salary <= max_salary)
);
CREATE TABLE IF NOT EXISTS public.bonus_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE, payroll_cycle_id UUID REFERENCES public.payroll_cycles(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0), currency_code CHAR(3) NOT NULL DEFAULT 'USD', reason TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','void')), approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL, approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_employee ON public.benefit_enrollments(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_equity_grants_employee ON public.equity_grants(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_vesting_events_grant_date ON public.equity_vesting_events(equity_grant_id, vesting_date);
CREATE TRIGGER benefit_plans_touch BEFORE UPDATE ON public.benefit_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER benefit_enrollments_touch BEFORE UPDATE ON public.benefit_enrollments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER equity_grants_touch BEFORE UPDATE ON public.equity_grants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER compensation_bands_touch BEFORE UPDATE ON public.compensation_bands FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER bonus_awards_touch BEFORE UPDATE ON public.bonus_awards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.benefit_plans ENABLE ROW LEVEL SECURITY; ALTER TABLE public.benefit_enrollments ENABLE ROW LEVEL SECURITY; ALTER TABLE public.benefit_dependents ENABLE ROW LEVEL SECURITY; ALTER TABLE public.equity_grants ENABLE ROW LEVEL SECURITY; ALTER TABLE public.equity_vesting_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.compensation_bands ENABLE ROW LEVEL SECURITY; ALTER TABLE public.bonus_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.benefit_plans FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.benefit_enrollments FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.benefit_dependents FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.equity_grants FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.equity_vesting_events FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.compensation_bands FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.bonus_awards FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
