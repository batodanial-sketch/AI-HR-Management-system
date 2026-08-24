-- Fluxentiq · FIX — sign-up trigger (trial / manual account creation)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL Editor (project: zeroaswkxyvcsoxtiyqs).
-- Fully idempotent — safe to re-run.
--
-- WHY: `admin.createUser` / `signUp` was failing with
--      "Database error creating new user".
--
-- Root cause (verified live, 2026-08-19):
--   1. The `handle_new_user` trigger INSERTs into `profiles.avatar_url`,
--      but the LIVE `profiles` table has NO `avatar_url` column (it drifted
--      from the canonical schema and now carries legacy employee columns:
--      role / department / employment_type / ai_score / attrition_risk).
--   2. `profiles.id` foreign-keys to the legacy `public.users` table, but the
--      trigger never created a `public.users` row — so even after fixing the
--      columns, new users would violate the FK.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Rewrite the trigger to match the live schema exactly.
--    - Creates the legacy `users` row (satisfies profiles.id → users FK).
--    - Creates the `profiles` row using ONLY columns that exist
--      (id, email, full_name) — the rest use their defaults.
--    - Grants a default `member` membership in the first organization.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.memberships (user_id, organization_id, role)
  SELECT NEW.id, o.id, 'member'
  FROM public.organizations o
  WHERE NOT EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.user_id = NEW.id
  )
  ORDER BY o.created_at ASC
  LIMIT 1;

  RETURN NEW;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. (Re)attach the trigger on auth.users.
-- ───────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Backfill any auth users currently missing a legacy `users` row or a
--    `profiles` row (idempotent).
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.users (id, email, full_name)
SELECT id, email, COALESCE(raw_user_meta_data ->> 'full_name', email)
FROM auth.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name)
SELECT id, email, COALESCE(raw_user_meta_data ->> 'full_name', email)
FROM auth.users
ON CONFLICT (id) DO NOTHING;
