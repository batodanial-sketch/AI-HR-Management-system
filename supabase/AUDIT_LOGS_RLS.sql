-- Fluxentiq · audit_logs RLS policy
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL Editor. Idempotent (DROP POLICY IF EXISTS +
-- CREATE POLICY). Safe to re-run.
--
-- Policy intent (matches the enterprise audit-logging requirement):
--   * SELECT — any organization member can read their own org's audit trail
--     (via the SECURITY DEFINER `is_organization_member` helper).
--   * INSERT — restricted to the authenticated actor (auth.uid()) writing rows
--     for their own organization, so audit entries can only be produced by the
--     server actions / authenticated user, not forged by arbitrary clients.
--
-- The `audit_logs` table already exists (legacy-shaped schema, reconciled with
-- the `actor_id` + `metadata` columns). `entity_type`/`entity_id` are the
-- canonical `resource_type`/`resource_id`.

-- ── Ensure the helper exists (SECURITY DEFINER, reads canonical memberships) ─
CREATE OR REPLACE FUNCTION public.is_organization_member(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = target_organization_id
  );
$$;

-- ── Enable RLS (idempotent) ────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ── Read: org members see their org's audit trail ──────────────────────────
DROP POLICY IF EXISTS audit_logs_select_org ON public.audit_logs;
CREATE POLICY audit_logs_select_org
  ON public.audit_logs
  FOR SELECT
  USING (public.is_organization_member(organization_id));

-- ── Insert: the authenticated actor writes their own org's rows ────────────
DROP POLICY IF EXISTS audit_logs_insert_self ON public.audit_logs;
CREATE POLICY audit_logs_insert_self
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()
    )
  );

-- ── No UPDATE/DELETE policy: the audit trail is append-only and tamper-proof ─
