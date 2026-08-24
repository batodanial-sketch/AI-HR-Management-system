-- External API key scopes and webhook delivery log extension.
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS revoked_reason TEXT;
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
CREATE INDEX IF NOT EXISTS idx_external_webhook_logs_org_created ON public.external_webhook_logs(organization_id,created_at DESC);
ALTER TABLE public.external_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.external_webhook_logs FOR ALL USING(public.is_organization_member(organization_id)) WITH CHECK(public.is_organization_member(organization_id));
