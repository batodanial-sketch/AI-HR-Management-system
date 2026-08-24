-- Fluxentiq authenticated workspace bootstrap
--
-- Allows an authenticated user with no active organization membership to create
-- exactly one initial organization and receive its owner membership. This is a
-- SECURITY DEFINER function so bootstrap can occur before tenant RLS access is
-- available. It never joins a caller to an existing organization.

CREATE OR REPLACE FUNCTION public.bootstrap_organization(
  workspace_name TEXT,
  workspace_slug TEXT
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  role_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_user_id UUID := auth.uid();
  normalized_name TEXT := btrim(workspace_name);
  normalized_slug TEXT := lower(btrim(workspace_slug));
  created_organization_id UUID;
  created_owner_role_id UUID;
BEGIN
  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to bootstrap a workspace.';
  END IF;

  IF char_length(normalized_name) < 2 OR char_length(normalized_name) > 180 THEN
    RAISE EXCEPTION 'Workspace name must contain between 2 and 180 characters.';
  END IF;

  IF normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length(normalized_slug) > 80 THEN
    RAISE EXCEPTION 'Workspace slug must use lowercase letters, numbers, and single hyphens only.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = caller_user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Authenticated profile was not found. Complete Supabase Auth signup first.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_memberships
    WHERE user_id = caller_user_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'The current user already has an active organization membership.';
  END IF;

  INSERT INTO public.organizations (name, legal_name, slug)
  VALUES (normalized_name, NULL, normalized_slug)
  RETURNING id INTO created_organization_id;

  INSERT INTO public.roles (
    organization_id,
    code,
    name,
    description,
    is_system,
    permissions
  )
  VALUES (
    created_organization_id,
    'owner',
    'Workspace Owner',
    'Initial workspace owner created through authenticated bootstrap.',
    FALSE,
    jsonb_build_array('*')
  )
  RETURNING id INTO created_owner_role_id;

  INSERT INTO public.organization_memberships (
    organization_id,
    user_id,
    role_id,
    status,
    invited_by,
    joined_at
  )
  VALUES (
    created_organization_id,
    caller_user_id,
    created_owner_role_id,
    'active',
    caller_user_id,
    now()
  );

  UPDATE public.users
  SET status = 'active', updated_at = now()
  WHERE id = caller_user_id;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state
  )
  VALUES (
    created_organization_id,
    caller_user_id,
    'create',
    'organization_bootstrap',
    created_organization_id,
    NULL,
    jsonb_build_object('role_code', 'owner', 'workspace_slug', normalized_slug)
  );

  RETURN QUERY
  SELECT created_organization_id, normalized_name, normalized_slug, 'owner'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_organization(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_organization(TEXT, TEXT) TO authenticated;
