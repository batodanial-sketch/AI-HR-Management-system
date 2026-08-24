-- Fluxentiq · RECONCILIATION — create the 32 tables missing from the live DB
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL Editor. Fully idempotent (CREATE TABLE IF NOT
-- EXISTS + CREATE POLICY are safe to re-run).
--
-- ORDER: tables are emitted in FOREIGN-KEY dependency order (topological
-- sort), so every REFERENCES target is created before its dependents.
--
-- WHY: the live DB was built from the LEGACY initial migration plus a partial
-- reconciliation, so 32 canonical tables the app references do not exist yet.
-- Features using them (scheduler, webhooks, LMS enrollment, equity vesting,
-- workforce forecasting, …) currently fail at runtime with 'table not found'.

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Tenant-check functions — is_organization_member + is_org_member
-- ---------------------------------------------------------------------------
-- Two latent bugs fixed here:
--   (a) is_org_member(uuid) is referenced by ~52 policies across migrations but
--       was NEVER defined anywhere — only is_organization_member exists.
--   (b) The live is_organization_member reads the LEGACY organization_memberships
--       table (1 stale row), while the app writes signups to the canonical
--       memberships table (12 rows). RLS tenant checks were therefore pointing
--       at the wrong table and denying real users.
--
-- Both definitions are idempotent (CREATE OR REPLACE) and read the CANONICAL
-- memberships table. The short name is kept as an alias for the other
-- migration files that reference it.
-- ───────────────────────────────────────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.is_org_member(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_organization_member(target_organization_id);
$$;

-- Returns the current user's role in an org (canonical memberships table).
-- Referenced by owner/admin-only policies (e.g. scheduled_jobs, webhooks).
CREATE OR REPLACE FUNCTION public.current_org_role(target_organization_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.role
  FROM public.memberships m
  WHERE m.user_id = auth.uid()
    AND m.organization_id = target_organization_id
  LIMIT 1;
$$;

-- ── access_revocation_records ──
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
ALTER TABLE public.access_revocation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.access_revocation_records FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── asset_assignments ──
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
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.asset_assignments FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── benefit_enrollments ──
CREATE TABLE IF NOT EXISTS public.benefit_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  benefit_plan_id UUID NOT NULL REFERENCES public.benefit_plans(id) ON DELETE CASCADE, employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('pending','enrolled','waived','cancelled')),
  effective_date DATE, ended_at DATE, selected_coverage JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (benefit_plan_id, employee_id)
);
ALTER TABLE public.benefit_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.benefit_enrollments FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── bonus_awards ──
CREATE TABLE IF NOT EXISTS public.bonus_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE, payroll_cycle_id UUID REFERENCES public.payroll_cycles(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0), currency_code CHAR(3) NOT NULL DEFAULT 'USD', reason TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','void')), approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL, approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bonus_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.bonus_awards FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── certification_definitions ──
CREATE TABLE IF NOT EXISTS public.certification_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  validity_months INTEGER CHECK (validity_months IS NULL OR validity_months > 0),
  course_id UUID REFERENCES public.learning_courses(id) ON DELETE SET NULL,
  template_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
ALTER TABLE public.certification_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.certification_definitions FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── contractors ──
CREATE TABLE IF NOT EXISTS public.contractors(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,legal_name TEXT NOT NULL,email CITEXT NOT NULL,country_code CHAR(2),currency_code CHAR(3) NOT NULL DEFAULT 'USD',status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive','terminated')),metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(organization_id,email));
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.contractors FOR ALL USING(public.is_organization_member(organization_id)) WITH CHECK(public.is_organization_member(organization_id));

-- ── currency_rates ──
CREATE TABLE IF NOT EXISTS public.currency_rates(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,base_currency CHAR(3) NOT NULL,quote_currency CHAR(3) NOT NULL,rate NUMERIC(18,8) NOT NULL CHECK(rate>0),source TEXT,as_of_date DATE NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(organization_id,base_currency,quote_currency,as_of_date));
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.currency_rates FOR ALL USING(public.is_organization_member(organization_id)) WITH CHECK(public.is_organization_member(organization_id));

-- ── equity_vesting_events ──
CREATE TABLE IF NOT EXISTS public.equity_vesting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  equity_grant_id UUID NOT NULL REFERENCES public.equity_grants(id) ON DELETE CASCADE, vesting_date DATE NOT NULL, quantity NUMERIC(18,4) NOT NULL CHECK (quantity >= 0), status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','vested','cancelled')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (equity_grant_id, vesting_date)
);
ALTER TABLE public.equity_vesting_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.equity_vesting_events FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── external_webhook_logs ──
CREATE TABLE IF NOT EXISTS public.external_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  event_type TEXT NOT NULL,
  endpoint TEXT,
  status_code INTEGER,
  payload_hash TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.external_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.external_webhook_logs FOR ALL USING(public.is_organization_member(organization_id)) WITH CHECK(public.is_organization_member(organization_id));

-- ── goal_check_ins ──
CREATE TABLE IF NOT EXISTS public.goal_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL DEFAULT current_date,
  current_value NUMERIC,
  progress_percent NUMERIC(5,2) NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
  confidence TEXT NOT NULL DEFAULT 'on_track' CHECK (confidence IN ('on_track', 'needs_attention', 'at_risk')),
  blockers TEXT,
  next_steps TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.goal_check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.goal_check_ins
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

-- ── learning_enrollments ──
CREATE TABLE IF NOT EXISTS public.learning_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'overdue', 'cancelled')),
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, employee_id)
);
ALTER TABLE public.learning_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.learning_enrollments FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── learning_lessons ──
CREATE TABLE IF NOT EXISTS public.learning_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_html TEXT,
  content_url TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 5 CHECK (duration_minutes > 0),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.learning_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.learning_lessons FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── learning_quizzes ──
CREATE TABLE IF NOT EXISTS public.learning_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  passing_score NUMERIC(5,2) NOT NULL DEFAULT 80 CHECK (passing_score BETWEEN 0 AND 100),
  max_attempts SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.learning_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.learning_quizzes FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── offboarding_tasks ──
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
ALTER TABLE public.offboarding_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.offboarding_tasks FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── onboarding_document_signing_requests ──
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
ALTER TABLE public.onboarding_document_signing_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.onboarding_document_signing_requests FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── performance_calibration_records ──
CREATE TABLE IF NOT EXISTS public.performance_calibration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  performance_cycle_id UUID NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  proposed_rating NUMERIC(3,1) CHECK (proposed_rating BETWEEN 1 AND 5),
  calibrated_rating NUMERIC(3,1) CHECK (calibrated_rating BETWEEN 1 AND 5),
  rationale TEXT,
  calibration_status TEXT NOT NULL DEFAULT 'pending' CHECK (calibration_status IN ('pending', 'confirmed', 'needs_review')),
  calibrated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  calibrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (performance_cycle_id, employee_id)
);
ALTER TABLE public.performance_calibration_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.performance_calibration_records
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

-- ── performance_feedback_requests ──
CREATE TABLE IF NOT EXISTS public.performance_feedback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  performance_cycle_id UUID REFERENCES public.performance_cycles(id) ON DELETE SET NULL,
  performance_review_id UUID REFERENCES public.performance_reviews(id) ON DELETE SET NULL,
  subject_employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  recipient_email CITEXT,
  relationship TEXT NOT NULL DEFAULT 'peer' CHECK (relationship IN ('self', 'manager', 'peer', 'direct_report', 'cross_functional', 'external')),
  visibility TEXT NOT NULL DEFAULT 'manager_and_hr' CHECK (visibility IN ('manager_and_hr', 'hr_only', 'subject_after_cycle', 'anonymous_to_subject')),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'expired', 'cancelled')),
  due_at TIMESTAMPTZ,
  token_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (recipient_employee_id IS NOT NULL OR recipient_email IS NOT NULL)
);
ALTER TABLE public.performance_feedback_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.performance_feedback_requests
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

-- ── policy_acknowledgements ──
CREATE TABLE IF NOT EXISTS public.policy_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL,
  policy_version TEXT NOT NULL DEFAULT '1',
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledgement_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, policy_name, policy_version)
);
ALTER TABLE public.policy_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.policy_acknowledgements FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── pulse_responses ──
CREATE TABLE IF NOT EXISTS public.pulse_responses(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,survey_id UUID NOT NULL REFERENCES public.pulse_surveys(id) ON DELETE CASCADE,employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,anonymous_token_hash TEXT,answers JSONB NOT NULL DEFAULT '{}'::jsonb,submitted_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.pulse_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.pulse_responses FOR ALL USING(public.is_organization_member(organization_id)) WITH CHECK(public.is_organization_member(organization_id));

-- ── scheduled_jobs ──
create table if not exists public.scheduled_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  job_type        text not null,          -- trial_expiry | payroll_reminder | report
  payload         jsonb not null default '{}'::jsonb,
  run_at          timestamptz not null,
  status          text not null default 'pending', -- pending | running | completed | failed
  locked_by       text,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.scheduled_jobs enable row level security;
create policy scheduled_jobs_select on public.scheduled_jobs
  for select using (organization_id is null or public.is_org_member(organization_id));
create policy scheduled_jobs_all on public.scheduled_jobs
  for all using (public.current_org_role(organization_id) in ('owner', 'admin'))
  with check (public.current_org_role(organization_id) in ('owner', 'admin'));

-- ── talent_assessments ──
CREATE TABLE IF NOT EXISTS public.talent_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  performance_cycle_id UUID NOT NULL REFERENCES public.performance_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  performance_rating NUMERIC(3,1) CHECK (performance_rating BETWEEN 1 AND 5),
  potential_rating NUMERIC(3,1) CHECK (potential_rating BETWEEN 1 AND 5),
  readiness TEXT NOT NULL DEFAULT 'developing' CHECK (readiness IN ('developing', 'ready_1_2_years', 'ready_now', 'critical_expert')),
  retention_risk TEXT NOT NULL DEFAULT 'not_assessed' CHECK (retention_risk IN ('not_assessed', 'low', 'moderate', 'high')),
  calibration_note TEXT,
  assessed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (performance_cycle_id, employee_id)
);
ALTER TABLE public.talent_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.talent_assessments
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

-- ── webhook_subscriptions ──
create table if not exists public.webhook_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  url             text not null,
  events          text[] not null default '{}',
  secret          text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
alter table public.webhook_subscriptions enable row level security;
create policy webhook_subs_select on public.webhook_subscriptions
  for select using (public.is_org_member(organization_id));
create policy webhook_subs_all on public.webhook_subscriptions
  for all using (public.current_org_role(organization_id) in ('owner', 'admin'))
  with check (public.current_org_role(organization_id) in ('owner', 'admin'));

-- ── workforce_forecasts ──
CREATE TABLE IF NOT EXISTS public.workforce_forecasts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,scenario_id UUID REFERENCES public.workforce_scenarios(id) ON DELETE SET NULL,period_date DATE NOT NULL,headcount_forecast NUMERIC(12,2),budget_forecast NUMERIC(14,2),confidence_low NUMERIC(12,2),confidence_high NUMERIC(12,2),model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.workforce_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.workforce_forecasts FOR ALL USING(public.is_organization_member(organization_id)) WITH CHECK(public.is_organization_member(organization_id));

-- ── benefit_dependents ──
CREATE TABLE IF NOT EXISTS public.benefit_dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  benefit_enrollment_id UUID NOT NULL REFERENCES public.benefit_enrollments(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, relationship TEXT NOT NULL, date_of_birth DATE, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.benefit_dependents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.benefit_dependents FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── compliance_requirements ──
CREATE TABLE IF NOT EXISTS public.compliance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  course_id UUID REFERENCES public.learning_courses(id) ON DELETE SET NULL,
  certification_id UUID REFERENCES public.certification_definitions(id) ON DELETE SET NULL,
  recurrence_months INTEGER,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.compliance_requirements FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── employee_certifications ──
CREATE TABLE IF NOT EXISTS public.employee_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  certification_id UUID NOT NULL REFERENCES public.certification_definitions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  issued_at DATE NOT NULL DEFAULT current_date,
  expires_at DATE,
  certificate_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (certification_id, employee_id, issued_at)
);
ALTER TABLE public.employee_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.employee_certifications FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── learning_lesson_progress ──
CREATE TABLE IF NOT EXISTS public.learning_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.learning_enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, lesson_id)
);
ALTER TABLE public.learning_lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.learning_lesson_progress FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── learning_quiz_attempts ──
CREATE TABLE IF NOT EXISTS public.learning_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.learning_quizzes(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.learning_enrollments(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC(5,2),
  passed BOOLEAN,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.learning_quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.learning_quiz_attempts FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── learning_quiz_questions ──
CREATE TABLE IF NOT EXISTS public.learning_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.learning_quizzes(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer')),
  choices JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer JSONB NOT NULL DEFAULT 'null'::jsonb,
  explanation TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.learning_quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.learning_quiz_questions FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));

-- ── performance_feedback_responses ──
CREATE TABLE IF NOT EXISTS public.performance_feedback_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feedback_request_id UUID NOT NULL REFERENCES public.performance_feedback_requests(id) ON DELETE CASCADE,
  respondent_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  respondent_email CITEXT,
  overall_rating NUMERIC(3,1) CHECK (overall_rating BETWEEN 1 AND 5),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  strengths TEXT,
  growth_areas TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feedback_request_id, respondent_employee_id),
  UNIQUE (feedback_request_id, respondent_email)
);
ALTER TABLE public.performance_feedback_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.performance_feedback_responses
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

-- ── webhook_deliveries ──
create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.webhook_subscriptions (id) on delete cascade,
  event           text not null,
  status          text not null default 'pending', -- pending | success | failed
  status_code     integer,
  response_body   text,
  attempted_at    timestamptz not null default now()
);
alter table public.webhook_deliveries enable row level security;
create policy webhook_deliveries_select on public.webhook_deliveries
  for select using (
    exists (
      select 1 from public.webhook_subscriptions ws
      where ws.id = subscription_id and public.is_org_member(ws.organization_id)
    )
  );

-- ── compliance_assignments ──
CREATE TABLE IF NOT EXISTS public.compliance_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.compliance_requirements(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'overdue', 'waived')),
  completed_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, employee_id)
);
ALTER TABLE public.compliance_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.compliance_assignments FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
