-- Fluxentiq · 20260830110000 — Audit trail & governance engine
-- ---------------------------------------------------------------------------
-- Adds the observability backbone for the enterprise hardening phase.
--
-- IMPORTANT: `audit_logs` ALREADY EXISTS in the live schema (legacy shape:
--   id, organization_id, actor_id, actor_user_id, action [audit_action enum],
--   entity_type, entity_id, before_state, after_state, metadata, ip_address,
--   user_agent, created_at).
--
-- This migration therefore EXTENDS the legacy table (never replaces it):
--   1. `actor_type`      — USER | COPILOT_AGENT | SYSTEM (governance triage)
--   2. `target_module`   — the HR module the action targeted
--   3. `changes`         — JSONB of what changed (credential-redacted)
--
-- The rich dotted action labels ("module.create", "copilot.tool.*") are mapped
-- to the constrained `audit_action` enum verb by the app, with the full label
-- preserved in `metadata.action` (see lib/audit.ts).
--
-- Also created here:
--   4. `inbound_webhook_events`    — raw inbound webhook receipts (n8n,
--                                    Twilio/WhatsApp) with verification +
--                                    processing status.
--   5. `candidate_communications`  — candidate touchpoints (WhatsApp replies)
--                                    driving automated stage advancement.
--
-- All tables are tenant-scoped via the existing `is_organization_member`
-- helper. Non-destructive: IF NOT EXISTS guards throughout.
-- ---------------------------------------------------------------------------

-- ── 1. Extend the legacy audit_logs table ─────────────────────────────────

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'USER',
    ADD COLUMN IF NOT EXISTS target_module text,
    ADD COLUMN IF NOT EXISTS changes jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill actor_type for historical rows written before the column existed.
UPDATE public.audit_logs
SET actor_type = 'USER'
WHERE actor_type IS NULL OR actor_type = '';

-- Constraint for new rows only (legacy rows are already backfilled).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_actor_type_check'
    ) THEN
        ALTER TABLE public.audit_logs
            ADD CONSTRAINT audit_logs_actor_type_check
            CHECK (actor_type IN ('USER', 'COPILOT_AGENT', 'SYSTEM'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx
    ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
    ON public.audit_logs (actor_id, actor_type, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_module_idx
    ON public.audit_logs (target_module, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_changes_gin_idx
    ON public.audit_logs USING gin (changes jsonb_path_ops);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Governance read/insert policies. Names are unique to this migration so the
-- legacy policies (if any) are untouched; multiple permissive policies
-- combine with OR semantics.
DROP POLICY IF EXISTS audit_logs_governance_select ON public.audit_logs;
CREATE POLICY audit_logs_governance_select ON public.audit_logs FOR SELECT
    USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS audit_logs_governance_insert ON public.audit_logs;
CREATE POLICY audit_logs_governance_insert ON public.audit_logs FOR INSERT
    WITH CHECK (
        public.is_organization_member(organization_id)
        AND (
            (actor_type = 'USER' AND actor_id = auth.uid()::text)
            OR (actor_type = 'COPILOT_AGENT' AND actor_id = auth.uid()::text)
        )
    );

-- ── 2. Inbound webhook receipts ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inbound_webhook_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
    provider            text NOT NULL,            -- n8n | twilio | whatsapp
    event               text NOT NULL,            -- candidate.whatsapp_reply | n8n.workflow_completed | screening.external_score
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    signature_verified  boolean NOT NULL DEFAULT false,
    signature_method    text,
    processed           boolean NOT NULL DEFAULT false,
    processing_error    text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbound_webhook_events_org_created_idx
    ON public.inbound_webhook_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbound_webhook_events_event_idx
    ON public.inbound_webhook_events (event, created_at DESC);

ALTER TABLE public.inbound_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbound_webhook_select_org ON public.inbound_webhook_events;
CREATE POLICY inbound_webhook_select_org ON public.inbound_webhook_events FOR SELECT
    USING (public.is_organization_member(organization_id));

-- Inserts are exclusively machine-driven (service role); no member insert policy.

-- ── 3. Candidate communications (WhatsApp replies, Twilio callbacks) ───────

CREATE TABLE IF NOT EXISTS public.candidate_communications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
    candidate_id    uuid NOT NULL REFERENCES public.candidates (id) ON DELETE CASCADE,
    channel         text NOT NULL DEFAULT 'whatsapp',
    direction       text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
    body            text NOT NULL,
    sentiment       text CHECK (sentiment IN ('positive', 'negative', 'neutral', 'unknown')),
    external_id     text,
    meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidate_communications_candidate_idx
    ON public.candidate_communications (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_communications_org_idx
    ON public.candidate_communications (organization_id, created_at DESC);

ALTER TABLE public.candidate_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidate_communications_select_org ON public.candidate_communications;
CREATE POLICY candidate_communications_select_org ON public.candidate_communications FOR SELECT
    USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS candidate_communications_insert_org ON public.candidate_communications;
CREATE POLICY candidate_communications_insert_org ON public.candidate_communications FOR INSERT
    WITH CHECK (
        public.is_organization_member(organization_id)
        AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN', 'MANAGER')
    );

-- ── Helper: advance a candidate one stage (applied → screening → interview
--    → offer → hired). Used by the inbound WhatsApp processor. ──────────────

CREATE OR REPLACE FUNCTION public.advance_candidate_stage(p_candidate uuid, p_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stage  text;
    v_next   text;
BEGIN
    SELECT c.stage INTO v_stage
    FROM candidates c
    WHERE c.id = p_candidate AND c.organization_id = p_org
    FOR UPDATE;

    IF v_stage IS NULL THEN
        RETURN NULL;
    END IF;

    v_next := CASE lower(v_stage)
        WHEN 'applied'   THEN 'screening'
        WHEN 'screening' THEN 'interview'
        WHEN 'interview' THEN 'offer'
        WHEN 'offer'     THEN 'hired'
        WHEN 'hired'     THEN NULL
        ELSE 'screening'
    END;

    IF v_next IS NOT NULL THEN
        UPDATE candidates
        SET stage = v_next, updated_at = now()
        WHERE id = p_candidate AND organization_id = p_org;
    END IF;

    RETURN v_next;
END
$$;
