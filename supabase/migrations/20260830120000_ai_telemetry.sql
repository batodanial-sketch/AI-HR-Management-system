-- Fluxentiq · 20260830120000 — AI telemetry & budget governance
-- ---------------------------------------------------------------------------
-- Dedicated AI token metering + per-organization budget controls:
--
--   `ai_token_usage`   — one row per model call: latency, prompt/completion
--                        tokens, cost, model/provider, feature, status.
--                        (The legacy `ai_usage` table remains untouched; the
--                        app falls back to it when this table is absent.)
--   `ai_budget_settings` — monthly token/cost caps + fallback routing per org.
--
-- All tables are RLS-protected: members read their tenant's rows; budget
-- writes require HR_ADMIN+ (via the user_role() helper from migration
-- 20260830100000_rbac_roles.sql).
-- ---------------------------------------------------------------------------

-- ── 1. Token usage telemetry ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_token_usage (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
    feature           text NOT NULL,
    model             text,
    provider          text,
    prompt_tokens     integer NOT NULL DEFAULT 0,
    completion_tokens integer NOT NULL DEFAULT 0,
    latency_ms        integer,
    cost_usd          numeric(12, 6) NOT NULL DEFAULT 0,
    status            text NOT NULL DEFAULT 'ok',
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_token_usage_org_created_idx
    ON public.ai_token_usage (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_token_usage_org_feature_idx
    ON public.ai_token_usage (organization_id, feature, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_token_usage_org_model_idx
    ON public.ai_token_usage (organization_id, model);

ALTER TABLE public.ai_token_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_token_usage_select_org ON public.ai_token_usage;
CREATE POLICY ai_token_usage_select_org ON public.ai_token_usage FOR SELECT
    USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS ai_token_usage_insert_org ON public.ai_token_usage;
CREATE POLICY ai_token_usage_insert_org ON public.ai_token_usage FOR INSERT
    WITH CHECK (public.is_organization_member(organization_id));

-- ── 2. Budget settings ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_budget_settings (
    organization_id      uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
    monthly_token_cap    bigint,
    monthly_cost_cap_usd numeric(12, 4),
    fallback_model       text,
    fallback_provider    text,
    enabled              boolean NOT NULL DEFAULT true,
    updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_budget_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_budget_settings_select_org ON public.ai_budget_settings;
CREATE POLICY ai_budget_settings_select_org ON public.ai_budget_settings FOR SELECT
    USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS ai_budget_settings_insert_org ON public.ai_budget_settings;
CREATE POLICY ai_budget_settings_insert_org ON public.ai_budget_settings FOR INSERT
    WITH CHECK (
        public.is_organization_member(organization_id)
        AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
    );

DROP POLICY IF EXISTS ai_budget_settings_update_org ON public.ai_budget_settings;
CREATE POLICY ai_budget_settings_update_org ON public.ai_budget_settings FOR UPDATE
    USING (
        public.is_organization_member(organization_id)
        AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
    )
    WITH CHECK (
        public.is_organization_member(organization_id)
        AND public.user_role(organization_id) IN ('HR_ADMIN', 'SUPER_ADMIN')
    );

-- ── 3. Demo organization defaults ─────────────────────────────────────────

DO $$
DECLARE
    demo_org UUID;
BEGIN
    SELECT id INTO demo_org
    FROM public.organizations
    WHERE id = '11111111-1111-4111-8111-111111111111'
       OR slug IN ('demo', 'fluxentiq-demo')
    LIMIT 1;

    IF demo_org IS NULL THEN
        RAISE NOTICE 'ai_telemetry: no demo organization found — skipping budget seed';
        RETURN;
    END IF;

    INSERT INTO public.ai_budget_settings (
        organization_id, monthly_token_cap, monthly_cost_cap_usd,
        fallback_model, fallback_provider, enabled
    )
    VALUES (
        demo_org,
        10000000,          -- 10M tokens/month
        500.0000,          -- $500/month
        'llama-3.1-8b-instant',
        'groq',
        true
    )
    ON CONFLICT (organization_id) DO NOTHING;

    RAISE NOTICE 'ai_telemetry: budget defaults ensured for demo org %', demo_org;
END
$$;
