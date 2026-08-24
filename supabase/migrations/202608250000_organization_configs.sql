-- Fluxentiq · Enterprise Studio & Admin Copilot — organization_configs
-- ---------------------------------------------------------------------------
-- Schema-driven dashboard customization engine gated behind FLUX-ENT license.
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS.
-- Safe to re-run via `supabase db push` or SQL Editor.

-- ── Table: organization_configs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_configs (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  dashboard_layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dynamic_schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  copilot_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Helpful indexes for JSONB queries (optional, but cheap)
CREATE INDEX IF NOT EXISTS idx_org_configs_updated_at ON public.organization_configs(updated_at DESC);

-- ── Helper: is_organization_admin ─────────────────────────────────────────
-- Returns true when current auth.uid() holds an owner/admin role in the target org.
-- Used for RLS policies that restrict writes to admins only.
CREATE OR REPLACE FUNCTION public.is_organization_admin(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    JOIN public.roles role ON role.id = membership.role_id
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = auth.uid()
      AND membership.status = 'active'
      AND lower(role.code) IN ('owner', 'admin', 'system_admin')
  );
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.organization_configs ENABLE ROW LEVEL SECURITY;

-- Select: any org member can read their own org config
DROP POLICY IF EXISTS organization_configs_select_member ON public.organization_configs;
CREATE POLICY organization_configs_select_member
  ON public.organization_configs
  FOR SELECT
  USING (public.is_organization_member(organization_id));

-- Insert: admin-only (server actions enforce admin via requireOrganizationContext, but RLS is defense-in-depth)
DROP POLICY IF EXISTS organization_configs_insert_admin ON public.organization_configs;
CREATE POLICY organization_configs_insert_admin
  ON public.organization_configs
  FOR INSERT
  WITH CHECK (public.is_organization_admin(organization_id));

-- Update: admin-only
DROP POLICY IF EXISTS organization_configs_update_admin ON public.organization_configs;
CREATE POLICY organization_configs_update_admin
  ON public.organization_configs
  FOR UPDATE
  USING (public.is_organization_admin(organization_id))
  WITH CHECK (public.is_organization_admin(organization_id));

-- Delete: admin-only (reset uses delete + default fallback)
DROP POLICY IF EXISTS organization_configs_delete_admin ON public.organization_configs;
CREATE POLICY organization_configs_delete_admin
  ON public.organization_configs
  FOR DELETE
  USING (public.is_organization_admin(organization_id));

-- ── Updated_at trigger ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS organization_configs_touch ON public.organization_configs;
CREATE TRIGGER organization_configs_touch
  BEFORE UPDATE ON public.organization_configs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.organization_configs IS 'Enterprise Studio: per-org dashboard layout, dynamic metadata schema, and copilot rules — gated behind FLUX-ENT license.';
COMMENT ON COLUMN public.organization_configs.dashboard_layout_json IS 'JSON: { widgets: [{id, enabled, order, config}] }';
COMMENT ON COLUMN public.organization_configs.dynamic_schema_json IS 'JSON: { fields: [{key, label, type, required, options}] }';
COMMENT ON COLUMN public.organization_configs.copilot_rules_json IS 'JSON: { rules: [{trigger, action, config}] }';
