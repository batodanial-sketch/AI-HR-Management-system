-- Fluxentiq onboarding, offboarding, and asset logistics extension.
-- Additive migration over existing onboarding programs, enrollments, and tasks.

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_tag TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'maintenance', 'retired', 'lost')),
  purchase_date DATE,
  purchase_cost NUMERIC(14,2),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, asset_tag),
  UNIQUE (organization_id, serial_number)
);

CREATE TABLE IF NOT EXISTS public.asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_back_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'returned', 'lost')),
  assignment_condition TEXT,
  return_condition TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_asset_assignment
  ON public.asset_assignments(asset_id)
  WHERE status = 'assigned';
CREATE INDEX IF NOT EXISTS idx_asset_assignments_employee_status
  ON public.asset_assignments(employee_id, status, assigned_at DESC);

CREATE TABLE IF NOT EXISTS public.onboarding_document_signing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.onboarding_enrollments(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'internal',
  provider_envelope_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'signed', 'declined', 'expired', 'cancelled')),
  signing_url TEXT,
  expires_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.offboarding_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  exit_interview JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_open_offboarding_case_per_employee
  ON public.offboarding_cases(employee_id)
  WHERE status IN ('planned', 'in_progress');

CREATE TABLE IF NOT EXISTS public.offboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offboarding_case_id UUID NOT NULL REFERENCES public.offboarding_cases(id) ON DELETE CASCADE,
  owner_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'blocked', 'completed', 'skipped')),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_revocation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offboarding_case_id UUID NOT NULL REFERENCES public.offboarding_cases(id) ON DELETE CASCADE,
  system_name TEXT NOT NULL,
  account_identifier TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'revoked', 'not_applicable', 'failed')),
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offboarding_case_id, system_name)
);

CREATE INDEX IF NOT EXISTS idx_assets_org_status ON public.assets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_offboarding_cases_org_status ON public.offboarding_cases(organization_id, status, effective_date);
CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_case_status ON public.offboarding_tasks(offboarding_case_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_access_revocations_case_status ON public.access_revocation_records(offboarding_case_id, status);

CREATE TRIGGER assets_touch BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER asset_assignments_touch BEFORE UPDATE ON public.asset_assignments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER onboarding_signing_requests_touch BEFORE UPDATE ON public.onboarding_document_signing_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER offboarding_cases_touch BEFORE UPDATE ON public.offboarding_cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER offboarding_tasks_touch BEFORE UPDATE ON public.offboarding_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER access_revocation_records_touch BEFORE UPDATE ON public.access_revocation_records FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_document_signing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offboarding_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_revocation_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.assets FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.asset_assignments FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.onboarding_document_signing_requests FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.offboarding_cases FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.offboarding_tasks FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.access_revocation_records FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
