-- Fluxentiq learning, certification, and compliance extension.

CREATE TABLE IF NOT EXISTS public.learning_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  level TEXT NOT NULL DEFAULT 'foundation' CHECK (level IN ('foundation', 'intermediate', 'advanced')),
  estimated_minutes INTEGER NOT NULL DEFAULT 30 CHECK (estimated_minutes > 0),
  cover_image_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_learning_enrollments_employee_status ON public.learning_enrollments(employee_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_assignments_employee_status ON public.compliance_assignments(employee_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_expiry ON public.employee_certifications(employee_id, expires_at);

CREATE TRIGGER learning_courses_touch BEFORE UPDATE ON public.learning_courses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER learning_lessons_touch BEFORE UPDATE ON public.learning_lessons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER learning_quizzes_touch BEFORE UPDATE ON public.learning_quizzes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER learning_quiz_questions_touch BEFORE UPDATE ON public.learning_quiz_questions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER learning_enrollments_touch BEFORE UPDATE ON public.learning_enrollments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER lesson_progress_touch BEFORE UPDATE ON public.learning_lesson_progress FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER certification_definitions_touch BEFORE UPDATE ON public.certification_definitions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER employee_certifications_touch BEFORE UPDATE ON public.employee_certifications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER compliance_requirements_touch BEFORE UPDATE ON public.compliance_requirements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER compliance_assignments_touch BEFORE UPDATE ON public.compliance_assignments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.learning_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certification_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.learning_courses FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.learning_lessons FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.learning_quizzes FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.learning_quiz_questions FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.learning_enrollments FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.learning_lesson_progress FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.learning_quiz_attempts FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.certification_definitions FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.employee_certifications FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.compliance_requirements FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.compliance_assignments FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY tenant_isolation ON public.policy_acknowledgements FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
