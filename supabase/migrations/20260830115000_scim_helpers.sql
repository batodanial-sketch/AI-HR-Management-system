-- Fluxentiq · 20260830115000 — SCIM provisioning helpers
-- ---------------------------------------------------------------------------
-- Server-side helpers for the SCIM 2.0 provisioning endpoints
-- (`/api/scim/v2/[tenantId]`). Called through the service-role client by the
-- app layer; none of these functions are reachable from the public API
-- directly. Idempotent (upserts), tenant-scoped, and audit-friendly.
-- ---------------------------------------------------------------------------

-- Resolve an auth user by email across tenants (service-role only usage).
CREATE OR REPLACE FUNCTION public.scim_find_user_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

-- Assign (or update) a role membership for a user in an organization.
-- Returns the membership id. Deprovisioning passes p_active = false.
CREATE OR REPLACE FUNCTION public.scim_assign_membership(
    p_org uuid,
    p_user uuid,
    p_role_code text,
    p_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id  uuid;
    v_membership_id uuid;
BEGIN
    SELECT r.id INTO v_role_id
    FROM roles r
    WHERE r.organization_id = p_org AND lower(r.code) = lower(p_role_code)
    LIMIT 1;

    SELECT om.id INTO v_membership_id
    FROM organization_memberships om
    WHERE om.user_id = p_user AND om.organization_id = p_org
    LIMIT 1
    FOR UPDATE;

    IF v_membership_id IS NULL THEN
        INSERT INTO organization_memberships (user_id, organization_id, role_id, status)
        VALUES (p_user, p_org, v_role_id, CASE WHEN p_active THEN 'active' ELSE 'inactive' END)
        RETURNING id INTO v_membership_id;
    ELSE
        UPDATE organization_memberships
        SET role_id = COALESCE(v_role_id, role_id),
            status = CASE WHEN p_active THEN 'active' ELSE 'inactive' END,
            updated_at = now()
        WHERE id = v_membership_id;
    END IF;

    RETURN v_membership_id;
END
$$;

-- List SCIM-provisioned memberships for an organization (id, user id, email,
-- role code, active flag) — drives GET /Users.
CREATE OR REPLACE FUNCTION public.scim_list_memberships(p_org uuid)
RETURNS TABLE (
    user_id uuid,
    email text,
    role_code text,
    active boolean,
    scim_external_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
      om.user_id,
      u.email,
      COALESCE(r.code, 'member'),
      om.status = 'active',
      (u.raw_user_meta_data ->> 'scim_external_id')::text
  FROM organization_memberships om
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN roles r ON r.id = om.role_id
  WHERE om.organization_id = p_org
  ORDER BY u.email ASC;
$$;
