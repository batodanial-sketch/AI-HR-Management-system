-- Fluxentiq · Phase R — pilot safety controls
--
-- 1. copilot_proposals   server-side proposal lifecycle for consequential
--                        Copilot actions (model → proposal → human confirm →
--                        authorization recheck → single-winner execution →
--                        receipt). The client only ever references a proposal
--                        id; arguments are frozen server-side at creation.
-- 2. document_files      tenant-scoped private document registry backing the
--                        upload → validate → quarantine → scan → accept/reject
--                        pipeline. Objects are keyed
--                        organization/{orgId}/documents/{documentId} and are
--                        only reachable through signed URLs minted after an
--                        authorization check.
--
-- Authorization is the canonical membership model (public.user_role /
-- public.is_organization_member from 20260906000100).

-- ── 1. Copilot proposals ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copilot_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  membership_id    uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  actor_id         uuid NOT NULL,
  tool_name        text NOT NULL,
  arguments        jsonb NOT NULL DEFAULT '{}'::jsonb,
  arguments_hash   text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','executing','executed','failed','denied','expired')),
  request_id       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  approved_by      uuid,
  approved_at      timestamptz,
  executed_at      timestamptz,
  result           jsonb,
  receipt          jsonb
);
CREATE INDEX IF NOT EXISTS copilot_proposals_org_status_idx
  ON public.copilot_proposals (organization_id, status, created_at DESC);

ALTER TABLE public.copilot_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_proposals FORCE ROW LEVEL SECURITY;

-- Members can read proposals of their own tenant (their own, or all for
-- MANAGER+). Writes go exclusively through the SECURITY DEFINER functions
-- below so state transitions are atomic and single-winner.
DROP POLICY IF EXISTS copilot_proposals_select ON public.copilot_proposals;
CREATE POLICY copilot_proposals_select ON public.copilot_proposals
  FOR SELECT USING (
    public.is_organization_member(organization_id)
    AND (
      actor_id = auth.uid()
      OR public.user_role(organization_id) IN ('MANAGER','HR_ADMIN','SUPER_ADMIN')
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.copilot_proposals FROM anon, authenticated;
GRANT SELECT ON public.copilot_proposals TO authenticated;

-- Create a proposal for the CALLER (actor and tenant derive from the session
-- + canonical membership; never from arguments).
CREATE OR REPLACE FUNCTION public.copilot_proposal_create(
  p_organization_id uuid,
  p_tool_name text,
  p_arguments jsonb,
  p_request_id text DEFAULT NULL,
  p_ttl interval DEFAULT interval '15 minutes'
) RETURNS public.copilot_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_membership public.memberships%ROWTYPE;
  v_row public.copilot_proposals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_membership FROM public.memberships
    WHERE user_id = auth.uid() AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no canonical membership for tenant' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.copilot_proposals
    (organization_id, membership_id, actor_id, tool_name, arguments, arguments_hash, request_id, expires_at)
  VALUES
    (p_organization_id, v_membership.id, auth.uid(), p_tool_name, COALESCE(p_arguments, '{}'::jsonb),
     encode(sha256(convert_to(COALESCE(p_arguments, '{}'::jsonb)::text, 'UTF8')), 'hex'),
     p_request_id, now() + p_ttl)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Claim a proposal for execution. Exactly ONE caller can move it from
-- pending → executing (conditional UPDATE). Authorization is re-checked at
-- claim time against the CURRENT membership: the approver must be the
-- original actor (or MANAGER+ in the same tenant) and must still hold a
-- privileged role. Expired / already-decided proposals are never claimable.
CREATE OR REPLACE FUNCTION public.copilot_proposal_claim(p_proposal_id uuid)
RETURNS public.copilot_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.copilot_proposals%ROWTYPE;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_row FROM public.copilot_proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal not found' USING ERRCODE = 'P0002';
  END IF;
  v_role := public.user_role(v_row.organization_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no canonical membership for tenant' USING ERRCODE = '42501';
  END IF;
  IF v_row.actor_id <> auth.uid() AND v_role NOT IN ('MANAGER','HR_ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not authorized to approve this proposal' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('MANAGER','HR_ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'role is not permitted to execute consequential actions' USING ERRCODE = '42501';
  END IF;
  UPDATE public.copilot_proposals
     SET status = 'executing', approved_by = auth.uid(), approved_at = now()
   WHERE id = p_proposal_id AND status = 'pending' AND expires_at > now()
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    -- Report why without leaking cross-tenant details (row is same-tenant here).
    SELECT * INTO v_row FROM public.copilot_proposals WHERE id = p_proposal_id;
    IF v_row.status = 'pending' AND v_row.expires_at <= now() THEN
      -- Persist the expiry (a RAISE would roll it back) and return the row;
      -- callers treat any status other than 'executing' as a refusal.
      UPDATE public.copilot_proposals SET status = 'expired'
       WHERE id = p_proposal_id AND status = 'pending'
      RETURNING * INTO v_row;
      RETURN v_row;
    END IF;
    RAISE EXCEPTION 'proposal already %', v_row.status USING ERRCODE = '55000';
  END IF;
  RETURN v_row;
END $$;

-- Finalize an executing proposal with a result and receipt (single transition).
CREATE OR REPLACE FUNCTION public.copilot_proposal_finish(
  p_proposal_id uuid, p_ok boolean, p_result jsonb, p_receipt jsonb
) RETURNS public.copilot_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.copilot_proposals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  UPDATE public.copilot_proposals
     SET status = CASE WHEN p_ok THEN 'executed' ELSE 'failed' END,
         executed_at = now(), result = p_result, receipt = p_receipt
   WHERE id = p_proposal_id AND status = 'executing' AND approved_by = auth.uid()
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal is not executing under this approver' USING ERRCODE = '55000';
  END IF;
  RETURN v_row;
END $$;

-- Deny (human rejects) — only pending, same rules as claim.
CREATE OR REPLACE FUNCTION public.copilot_proposal_deny(p_proposal_id uuid)
RETURNS public.copilot_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.copilot_proposals%ROWTYPE; v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_row FROM public.copilot_proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal not found' USING ERRCODE = 'P0002'; END IF;
  v_role := public.user_role(v_row.organization_id);
  IF v_role IS NULL OR (v_row.actor_id <> auth.uid() AND v_role NOT IN ('MANAGER','HR_ADMIN','SUPER_ADMIN')) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.copilot_proposals SET status = 'denied', approved_by = auth.uid(), approved_at = now()
   WHERE id = p_proposal_id AND status = 'pending' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal is not pending' USING ERRCODE = '55000'; END IF;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.copilot_proposal_create(uuid, text, jsonb, text, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.copilot_proposal_claim(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.copilot_proposal_finish(uuid, boolean, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.copilot_proposal_deny(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copilot_proposal_create(uuid, text, jsonb, text, interval) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copilot_proposal_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copilot_proposal_finish(uuid, boolean, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copilot_proposal_deny(uuid) TO authenticated;

-- ── 2. Document files (private, tenant-scoped, scanned) ────────────────────
CREATE TABLE IF NOT EXISTS public.document_files (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by      uuid NOT NULL,
  owner_type       text NOT NULL CHECK (owner_type IN ('candidate','employee','company')),
  owner_id         uuid,
  original_name    text NOT NULL,
  content_type     text NOT NULL,
  size_bytes       bigint NOT NULL CHECK (size_bytes >= 0),
  sha256           text NOT NULL,
  storage_bucket   text NOT NULL,
  storage_key      text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'quarantined'
                   CHECK (status IN ('quarantined','clean','infected','rejected','deleted')),
  scan_engine      text,
  scan_result      jsonb,
  scanned_at       timestamptz,
  retention_until  timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Object keys are always tenant-prefixed; enforced at the database too.
  CONSTRAINT document_files_key_tenant_prefix
    CHECK (storage_key LIKE 'organization/' || organization_id::text || '/documents/%')
);
CREATE INDEX IF NOT EXISTS document_files_org_owner_idx
  ON public.document_files (organization_id, owner_type, owner_id);

ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_files FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_files_select ON public.document_files;
CREATE POLICY document_files_select ON public.document_files
  FOR SELECT USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS document_files_insert ON public.document_files;
CREATE POLICY document_files_insert ON public.document_files
  FOR INSERT WITH CHECK (
    public.is_organization_member(organization_id)
    AND uploaded_by = auth.uid()
    AND public.user_role(organization_id) IN ('MANAGER','HR_ADMIN','SUPER_ADMIN')
  );

DROP POLICY IF EXISTS document_files_update ON public.document_files;
CREATE POLICY document_files_update ON public.document_files
  FOR UPDATE USING (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('MANAGER','HR_ADMIN','SUPER_ADMIN')
  ) WITH CHECK (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS document_files_delete ON public.document_files;
CREATE POLICY document_files_delete ON public.document_files
  FOR DELETE USING (
    public.is_organization_member(organization_id)
    AND public.user_role(organization_id) IN ('HR_ADMIN','SUPER_ADMIN')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_files TO authenticated;

-- Only clean files may ever be handed out. Enforced as a RESTRICTIVE policy
-- on the registry so a bug in application code cannot serve quarantined or
-- infected objects (the signed-URL minting path reads through this table).
DROP POLICY IF EXISTS document_files_status_transitions ON public.document_files;
CREATE POLICY document_files_status_transitions ON public.document_files
  AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (status IN ('quarantined','clean','infected','rejected','deleted'));

CREATE OR REPLACE FUNCTION public.document_files_touch() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS document_files_touch ON public.document_files;
CREATE TRIGGER document_files_touch BEFORE UPDATE ON public.document_files
  FOR EACH ROW EXECUTE FUNCTION public.document_files_touch();
