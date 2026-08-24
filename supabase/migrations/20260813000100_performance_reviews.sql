-- Fluxentiq performance management and 360° review extension.
-- Additive migration: canonical performance_cycles, goals, performance_reviews,
-- performance_review_answers, and feedback_notes already exist.

ALTER TABLE public.performance_cycles
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS calibration_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

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

CREATE INDEX IF NOT EXISTS idx_feedback_requests_subject_status
  ON public.performance_feedback_requests(subject_employee_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_request
  ON public.performance_feedback_responses(feedback_request_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_check_ins_goal_date
  ON public.goal_check_ins(goal_id, check_in_date DESC);
CREATE INDEX IF NOT EXISTS idx_talent_assessments_cycle
  ON public.talent_assessments(performance_cycle_id, performance_rating, potential_rating);
CREATE INDEX IF NOT EXISTS idx_calibration_cycle_status
  ON public.performance_calibration_records(performance_cycle_id, calibration_status);

CREATE TRIGGER feedback_requests_touch
  BEFORE UPDATE ON public.performance_feedback_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER feedback_responses_touch
  BEFORE UPDATE ON public.performance_feedback_responses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER talent_assessments_touch
  BEFORE UPDATE ON public.talent_assessments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER performance_calibration_records_touch
  BEFORE UPDATE ON public.performance_calibration_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.performance_feedback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_calibration_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.performance_feedback_requests
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.performance_feedback_responses
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.goal_check_ins
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.talent_assessments
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.performance_calibration_records
  FOR ALL USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
