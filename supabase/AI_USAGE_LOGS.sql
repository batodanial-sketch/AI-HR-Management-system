-- Fluxentiq · ai_usage_logs — token + cost observability
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL Editor. Idempotent (CREATE TABLE IF NOT EXISTS
-- + CREATE POLICY). Safe to re-run.
--
-- Records every AI call made through the Python bridge with prompt/completion
-- token counts and an estimated USD cost, so enterprise buyers can track AI
-- spend per organization (the admin "AI spend" view).

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  model              text NOT NULL,
  feature            text NOT NULL DEFAULT 'unknown',
  prompt_tokens      integer NOT NULL DEFAULT 0,
  completion_tokens  integer NOT NULL DEFAULT 0,
  cost_usd           numeric(12, 8) NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Lookup index for the per-org, time-ordered spend query.
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_org_time
  ON public.ai_usage_logs (organization_id, created_at DESC);

-- Tenant isolation via RLS.
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_logs_select_org ON public.ai_usage_logs;
CREATE POLICY ai_usage_logs_select_org
  ON public.ai_usage_logs
  FOR SELECT
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS ai_usage_logs_insert_org ON public.ai_usage_logs;
CREATE POLICY ai_usage_logs_insert_org
  ON public.ai_usage_logs
  FOR INSERT
  WITH CHECK (public.is_organization_member(organization_id));
