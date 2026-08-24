-- Fluxentiq Copilot audit compatibility layer.
-- Canonical writes remain in public.audit_logs to avoid a duplicate source of truth.
-- The security_invoker view exposes those records as system_audit_logs for
-- autonomous tool execution and operational dashboards.

CREATE OR REPLACE VIEW public.system_audit_logs
WITH (security_invoker = true)
AS
SELECT
  id,
  organization_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  before_state,
  after_state,
  ip_address,
  user_agent,
  created_at
FROM public.audit_logs;

COMMENT ON VIEW public.system_audit_logs IS
  'Compatibility view over canonical audit_logs for Fluxentiq autonomous tool execution records.';
