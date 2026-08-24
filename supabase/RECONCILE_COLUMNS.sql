-- Fluxentiq · RECONCILE_COLUMNS — add canonical columns the typed code requires
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL Editor. Fully idempotent (ADD COLUMN IF NOT
-- EXISTS). Safe to re-run.
--
-- WHY: stripping the 354 `as any` casts (Milestone 3) exposed that 7 live
-- tables are MISSING columns that `app/actions/*` writes/reads against the
-- canonical schema. These additions close the gap with the minimum set of
-- columns the typed code actually references — nothing extra, so no naming
-- conflicts with the remaining legacy columns.
--
-- All columns are added as nullable (or with a safe DEFAULT) so the ALTER
-- succeeds on tables that already contain legacy rows.

-- ── assets ────────────────────────────────────────────────────────────────
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS asset_tag TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC(14,2);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS currency_code CHAR(3) DEFAULT 'USD';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── learning_courses ───────────────────────────────────────────────────────
ALTER TABLE public.learning_courses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.learning_courses ADD COLUMN IF NOT EXISTS cover_image_key TEXT;
ALTER TABLE public.learning_courses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE public.learning_courses ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.learning_courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── benefit_plans ──────────────────────────────────────────────────────────
ALTER TABLE public.benefit_plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.benefit_plans ADD COLUMN IF NOT EXISTS currency_code CHAR(3) DEFAULT 'USD';
ALTER TABLE public.benefit_plans ADD COLUMN IF NOT EXISTS enrollment_start DATE;
ALTER TABLE public.benefit_plans ADD COLUMN IF NOT EXISTS enrollment_end DATE;
ALTER TABLE public.benefit_plans ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.benefit_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── equity_grants ──────────────────────────────────────────────────────────
ALTER TABLE public.equity_grants ADD COLUMN IF NOT EXISTS grant_date DATE;
ALTER TABLE public.equity_grants ADD COLUMN IF NOT EXISTS currency_code CHAR(3) DEFAULT 'USD';
ALTER TABLE public.equity_grants ADD COLUMN IF NOT EXISTS vesting_start_date DATE;
ALTER TABLE public.equity_grants ADD COLUMN IF NOT EXISTS vesting_end_date DATE;
ALTER TABLE public.equity_grants ADD COLUMN IF NOT EXISTS cliff_months INTEGER DEFAULT 0;
ALTER TABLE public.equity_grants ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.equity_grants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── expense_reports ────────────────────────────────────────────────────────
ALTER TABLE public.expense_reports ADD COLUMN IF NOT EXISTS expense_date DATE;
ALTER TABLE public.expense_reports ADD COLUMN IF NOT EXISTS currency_code CHAR(3);
ALTER TABLE public.expense_reports ADD COLUMN IF NOT EXISTS receipt_key TEXT;
ALTER TABLE public.expense_reports ADD COLUMN IF NOT EXISTS policy_flags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.expense_reports ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE public.expense_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── api_keys ───────────────────────────────────────────────────────────────
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

-- ── performance_cycles ─────────────────────────────────────────────────────
ALTER TABLE public.performance_cycles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.performance_cycles ADD COLUMN IF NOT EXISTS calibration_due_at TIMESTAMPTZ;
ALTER TABLE public.performance_cycles ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.performance_cycles ADD COLUMN IF NOT EXISTS created_by UUID;
