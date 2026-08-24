-- Fluxentiq AI Screening / Interview Kit schema delta.
-- The canonical initial migration already includes candidate_ai_assessments,
-- interviews, interview_feedback, resumes, applications, and audit_logs.
-- This migration adds explicit citation, suggested-question, and interview-kit
-- persistence required by the AI screening and interview-generation workflows.

ALTER TABLE public.candidate_ai_assessments
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suggested_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS screening_latency_ms INTEGER CHECK (screening_latency_ms IS NULL OR screening_latency_ms >= 0);

CREATE TABLE IF NOT EXISTS public.ai_interview_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES public.candidate_ai_assessments(id) ON DELETE SET NULL,
  generated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  interview_round TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 10 AND 180),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessment_rubric JSONB NOT NULL DEFAULT '{}'::jsonb,
  time_allocation JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_interview_kits_application_created
  ON public.ai_interview_kits(application_id, created_at DESC);

ALTER TABLE public.ai_interview_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON public.ai_interview_kits
  FOR ALL
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
