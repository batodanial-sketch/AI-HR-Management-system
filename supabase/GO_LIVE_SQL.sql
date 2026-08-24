-- Fluxentiq · GO-LIVE reconciliation (paste into Supabase SQL Editor)
-- ---------------------------------------------------------------------------
-- Your live Supabase project (zeroaswkxyvcsoxtiyqs) currently has the LEGACY
-- enterprise schema. This script reconciles it to the canonical schema the
-- running app reads, WITHOUT dropping any legacy data. Idempotent — safe to
-- re-run.
--
-- It fixes the specific gaps found during live verification:
--   1. Missing `memberships` table (auth.ts's getCurrentUser() reads it).
--   2. Missing `profiles` auto-creation trigger (handle_new_user).
--   3. Missing canonical columns on legacy tables (employees.email, etc.).

-- ── 1. memberships (our auth layer reads this; legacy uses org_memberships) ──
CREATE TABLE IF NOT EXISTS public.memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

-- Backfill memberships from the legacy organization_memberships table, so the
-- existing user (and any existing members) appear with the right role.
-- Maps the legacy roles.code → our canonical text role. role_id is a UUID FK;
-- if it's NULL (no role assigned), default to 'member'.
INSERT INTO public.memberships (user_id, organization_id, role)
SELECT
  m.user_id,
  m.organization_id,
  CASE r.code
    WHEN 'owner' THEN 'owner'
    WHEN 'admin' THEN 'admin'
    WHEN 'manager' THEN 'manager'
    ELSE 'member'
  END
FROM public.organization_memberships m
LEFT JOIN public.roles r ON r.id = m.role_id
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- ── 2. profiles auto-create on signup ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      text NOT NULL,
  full_name  text,
  avatar_url text,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email, ''),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill profiles for existing auth users (the confirmed user has no profile yet).
INSERT INTO public.profiles (id, email, full_name)
SELECT id, email, COALESCE(raw_user_meta_data ->> 'full_name', email)
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ── 3. canonical columns on legacy tables (ADD COLUMN IF NOT EXISTS) ────────
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'trialing';

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS source_tag TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS job_posting_id UUID;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS match_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS source_tag TEXT;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'applied';

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'info';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS source_tag TEXT;
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS used_days NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS source_tag TEXT;

ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS gross_pay NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS deductions NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS net_pay NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS source_tag TEXT;

-- ── 4. ensure the 1 existing auth user has an org membership ────────────────
-- (best-effort: links the first organization to the first user if no membership exists)
INSERT INTO public.memberships (user_id, organization_id, role)
SELECT u.id, o.id, 'admin'
FROM auth.users u
CROSS JOIN (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1) o
WHERE NOT EXISTS (
  SELECT 1 FROM public.memberships m WHERE m.user_id = u.id
)
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- ── done ────────────────────────────────────────────────────────────────────
-- After running, the app's auth layer (getCurrentUser → profiles + memberships)
-- and data layer (lib/api.ts → employees.email, etc.) will resolve correctly.
