-- Fluxentiq · SEED + SECURITY (v2 — corrected)
-- ---------------------------------------------------------------------------
-- Paste into Supabase SQL Editor and Run once. Fully idempotent.
--
-- 1. Fixes handle_new_user → defaults signups to 'member' (lowercase).
-- 2. CREATES the 15 domain tables missing from the live DB.
-- 3. ADDS canonical display columns to existing legacy tables.
-- 4. Seeds workforce + operations + performance/talent + light domain data.

-- ───────────────────────────────────────────────────────────────────────────
-- PART 1 — Security: default new signups to MEMBER (lowercase, null-safe)
-- ───────────────────────────────────────────────────────────────────────────
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
-- PART 2 — CREATE the 15 missing domain tables (canonical columns)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learning_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  title text NOT NULL,
  category text,
  level text NOT NULL DEFAULT 'foundation',
  estimated_minutes integer NOT NULL DEFAULT 0,
  enrolled integer NOT NULL DEFAULT 0,
  completion_rate integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benefit_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  provider text,
  plan_type text NOT NULL,
  employee_cost numeric NOT NULL DEFAULT 0,
  employer_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equity_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid,
  employee_name text,
  grant_type text NOT NULL DEFAULT 'option',
  quantity numeric NOT NULL DEFAULT 0,
  strike_price numeric,
  vesting_months integer NOT NULL DEFAULT 48,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid,
  employee_name text,
  merchant text,
  category text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pulse_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  title text NOT NULL,
  anonymous boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  responses integer NOT NULL DEFAULT 0,
  enps integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workforce_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  headcount_forecast numeric NOT NULL DEFAULT 0,
  budget_forecast numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contractor_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contractor_id uuid,
  contractor text,
  invoice_number text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.offboarding_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid,
  employee_name text,
  exit_date date,
  status text NOT NULL DEFAULT 'planned',
  tasks_done integer NOT NULL DEFAULT 0,
  tasks_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'available',
  assignee_id uuid,
  assignee text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compensation_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  level text NOT NULL,
  title text NOT NULL,
  min_salary numeric NOT NULL DEFAULT 0,
  mid_salary numeric NOT NULL DEFAULT 0,
  max_salary numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  lead_id uuid,
  name text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  stage text NOT NULL DEFAULT 'discovery',
  probability integer NOT NULL DEFAULT 20,
  expected_close_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboard_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  delta numeric NOT NULL DEFAULT 0,
  delta_label text,
  spark integer[] NOT NULL DEFAULT '{}',
  format text NOT NULL DEFAULT 'number',
  currency text,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  title text NOT NULL,
  department text,
  location text,
  status text NOT NULL DEFAULT 'open',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.candidate_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  summary text,
  recommendation text NOT NULL DEFAULT 'hold',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  feature text NOT NULL,
  model text,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- PART 3 — ADD canonical display columns to existing legacy tables
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS employee_name text;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS clock_in timestamptz;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS clock_out timestamptz;

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS employee_name text;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS objective text;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS progress numeric;

ALTER TABLE public.performance_cycles ADD COLUMN IF NOT EXISTS participants integer NOT NULL DEFAULT 0;

ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.leave_requests ALTER COLUMN leave_type_id DROP NOT NULL;

-- Legacy payroll_line_items keys off payroll_entry_id and has no per-employee
-- or per-run columns. Add every canonical column the app (lib/api.ts) reads.
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS payroll_run_id uuid;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS employee_id uuid;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS employee_name text;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS gross_pay numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS deductions numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS net_pay numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_line_items ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
ALTER TABLE public.payroll_line_items ALTER COLUMN payroll_entry_id DROP NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- PART 4 — Seed core workforce + operations + performance/talent
-- ───────────────────────────────────────────────────────────────────────────
-- Departments (5)
INSERT INTO departments (id, organization_id, name, code) VALUES
  ('20000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Engineering', 'ENG'),
  ('20000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Design', 'DSG'),
  ('20000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'People Ops', 'PEO'),
  ('20000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', 'Finance', 'FIN'),
  ('20000000-0000-4000-8000-000000000005', '409458f5-d45b-486e-9a69-18997eabdc23', 'Sales', 'SAL')
ON CONFLICT (organization_id, name) DO NOTHING;

-- Job titles (5)
INSERT INTO job_titles (id, organization_id, name, level) VALUES
  ('30000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Backend Engineer', 'L3'),
  ('30000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Product Designer', 'L3'),
  ('30000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'HR Business Partner', 'L4'),
  ('30000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', 'Payroll Analyst', 'L3'),
  ('30000000-0000-4000-8000-000000000005', '409458f5-d45b-486e-9a69-18997eabdc23', 'Account Executive', 'L3')
ON CONFLICT (organization_id, name) DO NOTHING;

-- Employees (12) — legacy + canonical columns
INSERT INTO employees (
  id, organization_id, employee_number, first_name, last_name,
  work_email, email, status, employment_status, start_date,
  department_id, department, job_title_id, title, role, location
) VALUES
  ('10000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-001', 'Ayesha', 'Rahman', 'ayesha.rahman@fluxentiq.test', 'ayesha.rahman@fluxentiq.test', 'active', 'active', '2022-03-14', '20000000-0000-4000-8000-000000000001', 'Engineering', '30000000-0000-4000-8000-000000000001', 'Backend Engineer', 'Backend Engineer', 'Karachi, PK'),
  ('10000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-002', 'Daniel', 'Mbeki', 'daniel.mbeki@fluxentiq.test', 'daniel.mbeki@fluxentiq.test', 'active', 'active', '2021-11-02', '20000000-0000-4000-8000-000000000002', 'Design', '30000000-0000-4000-8000-000000000002', 'Product Designer', 'Product Designer', 'Remote, ZA'),
  ('10000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-003', 'Sofia', 'Lindqvist', 'sofia.lindqvist@fluxentiq.test', 'sofia.lindqvist@fluxentiq.test', 'on_leave', 'on_leave', '2020-06-22', '20000000-0000-4000-8000-000000000003', 'People Ops', '30000000-0000-4000-8000-000000000003', 'HR Business Partner', 'HR Business Partner', 'Stockholm, SE'),
  ('10000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-004', 'Miguel', 'Torres', 'miguel.torres@fluxentiq.test', 'miguel.torres@fluxentiq.test', 'active', 'active', '2023-02-13', '20000000-0000-4000-8000-000000000001', 'Engineering', '30000000-0000-4000-8000-000000000001', 'Backend Engineer', 'Backend Engineer', 'Mexico City, MX'),
  ('10000000-0000-4000-8000-000000000005', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-005', 'Priya', 'Nair', 'priya.nair@fluxentiq.test', 'priya.nair@fluxentiq.test', 'active', 'active', '2022-08-01', '20000000-0000-4000-8000-000000000004', 'Finance', '30000000-0000-4000-8000-000000000004', 'Payroll Analyst', 'Payroll Analyst', 'Bengaluru, IN'),
  ('10000000-0000-4000-8000-000000000006', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-006', 'Omar', 'Haddad', 'omar.haddad@fluxentiq.test', 'omar.haddad@fluxentiq.test', 'active', 'active', '2021-01-18', '20000000-0000-4000-8000-000000000005', 'Sales', '30000000-0000-4000-8000-000000000005', 'Account Executive', 'Account Executive', 'Dubai, AE'),
  ('10000000-0000-4000-8000-000000000007', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-007', 'Emma', 'Johnson', 'emma.johnson@fluxentiq.test', 'emma.johnson@fluxentiq.test', 'active', 'active', '2023-06-05', '20000000-0000-4000-8000-000000000003', 'People Ops', '30000000-0000-4000-8000-000000000003', 'HR Business Partner', 'HR Business Partner', 'London, UK'),
  ('10000000-0000-4000-8000-000000000008', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-008', 'Lucas', 'Silva', 'lucas.silva@fluxentiq.test', 'lucas.silva@fluxentiq.test', 'active', 'active', '2022-10-11', '20000000-0000-4000-8000-000000000001', 'Engineering', '30000000-0000-4000-8000-000000000001', 'Backend Engineer', 'Backend Engineer', 'Sao Paulo, BR'),
  ('10000000-0000-4000-8000-000000000009', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-009', 'Maya', 'Patel', 'maya.patel@fluxentiq.test', 'maya.patel@fluxentiq.test', 'active', 'active', '2024-01-08', '20000000-0000-4000-8000-000000000002', 'Design', '30000000-0000-4000-8000-000000000002', 'Product Designer', 'Product Designer', 'Remote, IN'),
  ('10000000-0000-4000-8000-000000000010', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-010', 'James', 'Carter', 'james.carter@fluxentiq.test', 'james.carter@fluxentiq.test', 'active', 'active', '2023-09-18', '20000000-0000-4000-8000-000000000005', 'Sales', '30000000-0000-4000-8000-000000000005', 'Account Executive', 'Account Executive', 'New York, US'),
  ('10000000-0000-4000-8000-000000000011', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-011', 'Ines', 'Marques', 'ines.marques@fluxentiq.test', 'ines.marques@fluxentiq.test', 'active', 'active', '2024-03-04', '20000000-0000-4000-8000-000000000004', 'Finance', '30000000-0000-4000-8000-000000000004', 'Payroll Analyst', 'Payroll Analyst', 'Lisbon, PT'),
  ('10000000-0000-4000-8000-000000000012', '409458f5-d45b-486e-9a69-18997eabdc23', 'EMP-012', 'Wei', 'Zhang', 'wei.zhang@fluxentiq.test', 'wei.zhang@fluxentiq.test', 'active', 'active', '2023-12-11', '20000000-0000-4000-8000-000000000001', 'Engineering', '30000000-0000-4000-8000-000000000001', 'Backend Engineer', 'Backend Engineer', 'Remote, CN')
ON CONFLICT (id) DO NOTHING;

-- Attendance (12)
INSERT INTO attendance_records (
  id, organization_id, employee_id, work_date, status,
  check_in_at, check_out_at, worked_minutes, employee_name, clock_in, clock_out
) VALUES
  ('40000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000001', '2025-03-17', 'present', '2025-03-17T08:58:00Z', '2025-03-17T17:05:00Z', 487, 'Ayesha Rahman', '2025-03-17T08:58:00Z', '2025-03-17T17:05:00Z'),
  ('40000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000002', '2025-03-17', 'present', '2025-03-17T08:45:00Z', '2025-03-17T17:15:00Z', 510, 'Daniel Mbeki', '2025-03-17T08:45:00Z', '2025-03-17T17:15:00Z'),
  ('40000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000003', '2025-03-17', 'on_leave', NULL, NULL, 0, 'Sofia Lindqvist', NULL, NULL),
  ('40000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000004', '2025-03-17', 'late', '2025-03-17T09:22:00Z', '2025-03-17T18:10:00Z', 528, 'Miguel Torres', '2025-03-17T09:22:00Z', '2025-03-17T18:10:00Z'),
  ('40000000-0000-4000-8000-000000000005', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000005', '2025-03-17', 'present', '2025-03-17T08:30:00Z', '2025-03-17T17:30:00Z', 540, 'Priya Nair', '2025-03-17T08:30:00Z', '2025-03-17T17:30:00Z'),
  ('40000000-0000-4000-8000-000000000006', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000006', '2025-03-17', 'remote', '2025-03-17T08:15:00Z', '2025-03-17T16:45:00Z', 510, 'Omar Haddad', '2025-03-17T08:15:00Z', '2025-03-17T16:45:00Z'),
  ('40000000-0000-4000-8000-000000000007', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000007', '2025-03-17', 'present', '2025-03-17T09:00:00Z', '2025-03-17T17:00:00Z', 480, 'Emma Johnson', '2025-03-17T09:00:00Z', '2025-03-17T17:00:00Z'),
  ('40000000-0000-4000-8000-000000000008', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000008', '2025-03-17', 'present', '2025-03-17T08:50:00Z', '2025-03-17T17:20:00Z', 510, 'Lucas Silva', '2025-03-17T08:50:00Z', '2025-03-17T17:20:00Z'),
  ('40000000-0000-4000-8000-000000000009', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000009', '2025-03-17', 'present', '2025-03-17T08:40:00Z', '2025-03-17T17:10:00Z', 510, 'Maya Patel', '2025-03-17T08:40:00Z', '2025-03-17T17:10:00Z'),
  ('40000000-0000-4000-8000-000000000010', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000010', '2025-03-17', 'present', '2025-03-17T08:55:00Z', '2025-03-17T17:05:00Z', 490, 'James Carter', '2025-03-17T08:55:00Z', '2025-03-17T17:05:00Z'),
  ('40000000-0000-4000-8000-000000000011', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000011', '2025-03-17', 'present', '2025-03-17T09:05:00Z', '2025-03-17T17:15:00Z', 490, 'Ines Marques', '2025-03-17T09:05:00Z', '2025-03-17T17:15:00Z'),
  ('40000000-0000-4000-8000-000000000012', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000012', '2025-03-17', 'present', '2025-03-17T08:35:00Z', '2025-03-17T17:25:00Z', 530, 'Wei Zhang', '2025-03-17T08:35:00Z', '2025-03-17T17:25:00Z')
ON CONFLICT (employee_id, work_date) DO NOTHING;

-- Goals / OKRs (6)
INSERT INTO goals (
  id, organization_id, employee_id, title, description, progress_percent, status, due_date,
  employee_name, objective, progress
) VALUES
  ('50000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000001', 'Platform migration', 'Migrate auth service to OIDC', 65, 'in_progress', '2025-06-30', 'Ayesha Rahman', 'Migrate auth service to OIDC', 65),
  ('50000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000004', 'Design system v2', 'Ship the v2 component library', 90, 'on_track', '2025-05-15', 'Miguel Torres', 'Ship the v2 component library', 90),
  ('50000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000005', 'Payroll automation', 'Cut payroll run time by 40%', 30, 'at_risk', '2025-07-01', 'Priya Nair', 'Cut payroll run time by 40%', 30),
  ('50000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000002', 'Accessibility', 'Achieve WCAG 2.1 AA across the app', 100, 'completed', '2025-04-01', 'Daniel Mbeki', 'Achieve WCAG 2.1 AA across the app', 100),
  ('50000000-0000-4000-8000-000000000005', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000007', 'Onboarding revamp', 'Reduce time-to-productivity to 2 weeks', 45, 'in_progress', '2025-08-01', 'Emma Johnson', 'Reduce time-to-productivity to 2 weeks', 45),
  ('50000000-0000-4000-8000-000000000006', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000008', 'API reliability', 'Reach 99.95% uptime on core APIs', 75, 'on_track', '2025-06-15', 'Lucas Silva', 'Reach 99.95% uptime on core APIs', 75)
ON CONFLICT (id) DO NOTHING;

-- Candidates (5)
INSERT INTO candidates (
  id, organization_id, first_name, last_name, email, stage, match_score, source
) VALUES
  ('60000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Lena', 'Kowalski', 'lena.kowalski@example.com', 'applied', 78, 'LinkedIn'),
  ('60000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Theo', 'Dubois', 'theo.dubois@example.com', 'screening', 86, 'Referral'),
  ('60000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'Amara', 'Okafor', 'amara.okafor@example.com', 'interview', 91, 'Careers page'),
  ('60000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', 'Wei', 'Chen', 'wei.chen@example.com', 'offer', 94, 'Referral'),
  ('60000000-0000-4000-8000-000000000005', '409458f5-d45b-486e-9a69-18997eabdc23', 'Ines', 'Rocha', 'ines.rocha@example.com', 'hired', 89, 'LinkedIn')
ON CONFLICT (id) DO NOTHING;

-- Payroll runs (2) + line items (6)
INSERT INTO payroll_runs (id, organization_id, period_start, period_end, status, currency) VALUES
  ('70000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', '2025-02-01', '2025-02-28', 'completed', 'USD'),
  ('70000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', '2025-02-01', '2025-02-28', 'completed', 'EUR')
ON CONFLICT (id) DO NOTHING;

INSERT INTO payroll_line_items (
  id, organization_id, payroll_run_id, employee_id, employee_name,
  line_type, code, label, amount, gross_pay, deductions, net_pay, currency
) VALUES
  ('71000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', '70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Ayesha Rahman', 'earning', 'SALARY', 'Base salary', 5000, 5000, 1000, 4000, 'USD'),
  ('71000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', '70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Daniel Mbeki', 'earning', 'SALARY', 'Base salary', 6000, 6000, 1200, 4800, 'USD'),
  ('71000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', '70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'Miguel Torres', 'earning', 'SALARY', 'Base salary', 5500, 5500, 1100, 4400, 'USD'),
  ('71000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', '70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'Sofia Lindqvist', 'earning', 'SALARY', 'Base salary', 4000, 4000, 800, 3200, 'EUR'),
  ('71000000-0000-4000-8000-000000000005', '409458f5-d45b-486e-9a69-18997eabdc23', '70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 'Priya Nair', 'earning', 'SALARY', 'Base salary', 3500, 3500, 700, 2800, 'EUR'),
  ('71000000-0000-4000-8000-000000000006', '409458f5-d45b-486e-9a69-18997eabdc23', '70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000007', 'Emma Johnson', 'earning', 'SALARY', 'Base salary', 3800, 3800, 760, 3040, 'EUR')
ON CONFLICT (id) DO NOTHING;

-- Leave requests (3)
INSERT INTO leave_requests (
  id, organization_id, employee_id, type, start_date, end_date, total_days, status, employee_name
) VALUES
  ('80000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000004', 'pto', '2025-03-10', '2025-03-12', 3, 'pending', 'Miguel Torres'),
  ('80000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000002', 'sick', '2025-03-01', '2025-03-02', 2, 'approved', 'Daniel Mbeki'),
  ('80000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000005', 'pto', '2025-03-18', '2025-03-22', 5, 'pending', 'Priya Nair')
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- PART 5 — Light seed for the newly-created domain tables (all 18 modules)
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO learning_courses (id, organization_id, title, category, level, estimated_minutes, enrolled, completion_rate) VALUES
  ('90000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'GDPR & Data Protection', 'Compliance', 'foundation', 45, 118, 92),
  ('90000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Inclusive Hiring Practices', 'People Ops', 'intermediate', 60, 64, 78),
  ('90000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'Engineering Leadership', 'Leadership', 'advanced', 120, 22, 55),
  ('90000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', 'Security Awareness', 'Compliance', 'foundation', 30, 128, 97)
ON CONFLICT (id) DO NOTHING;

INSERT INTO benefit_plans (id, organization_id, name, provider, plan_type, employee_cost, employer_cost, status) VALUES
  ('a1000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Health — PPO', 'BlueShield', 'medical', 180, 620, 'active'),
  ('a1000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Dental', 'DeltaDental', 'dental', 35, 120, 'active'),
  ('a1000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', '401(k) Match', 'Fidelity', 'retirement', 0, 240, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO equity_grants (id, organization_id, employee_id, employee_name, grant_type, quantity, strike_price, vesting_months, status) VALUES
  ('a2000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000001', 'Ayesha Rahman', 'rsu', 400, NULL, 48, 'active'),
  ('a2000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000004', 'Miguel Torres', 'option', 2000, 12.5, 48, 'active'),
  ('a2000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000003', 'Sofia Lindqvist', 'rsu', 600, NULL, 48, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO expense_reports (id, organization_id, employee_id, employee_name, merchant, category, amount, currency, status) VALUES
  ('a3000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000005', 'Priya Nair', 'AWS', 'Software', 2400, 'USD', 'pending'),
  ('a3000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000002', 'Daniel Mbeki', 'Figma', 'Software', 180, 'USD', 'approved'),
  ('a3000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000004', 'Miguel Torres', 'Delta Airlines', 'Travel', 940, 'USD', 'pending'),
  ('a3000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000001', 'Ayesha Rahman', 'WeWork', 'Facilities', 600, 'USD', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pulse_surveys (id, organization_id, title, anonymous, status, responses, enps) VALUES
  ('a4000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Q2 Engagement Pulse', true, 'active', 84, 42),
  ('a4000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Return-to-office sentiment', true, 'closed', 110, 18),
  ('a4000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'Manager effectiveness', false, 'draft', 0, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO workforce_scenarios (id, organization_id, name, headcount_forecast, budget_forecast, status) VALUES
  ('a5000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Base case', 132, 910000, 'approved'),
  ('a5000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Growth +20%', 154, 1080000, 'draft'),
  ('a5000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'Hiring freeze', 126, 860000, 'draft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO contractor_invoices (id, organization_id, contractor, invoice_number, total_amount, currency, status) VALUES
  ('a6000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Devs Inc.', 'INV-2025-014', 12000, 'USD', 'submitted'),
  ('a6000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Design Studio Co.', 'INV-2025-015', 4800, 'USD', 'approved'),
  ('a6000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'Ops Freelance', 'INV-2025-016', 3200, 'EUR', 'draft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO offboarding_cases (id, organization_id, employee_id, employee_name, exit_date, status, tasks_done, tasks_total) VALUES
  ('a7000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', '10000000-0000-4000-8000-000000000006', 'Omar Haddad', '2025-03-28', 'in_progress', 6, 9),
  ('a7000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', NULL, 'Emma Johnson', '2025-04-11', 'planned', 0, 9)
ON CONFLICT (id) DO NOTHING;

INSERT INTO assets (id, organization_id, name, category, status, assignee) VALUES
  ('a8000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'MacBook Pro 14', 'Laptop', 'assigned', 'Ayesha Rahman'),
  ('a8000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Dell UltraSharp 27', 'Monitor', 'assigned', 'Miguel Torres'),
  ('a8000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'YubiKey 5C', 'Security', 'available', NULL),
  ('a8000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', 'Sony WH-1000XM5', 'Peripheral', 'maintenance', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO compensation_bands (id, organization_id, level, title, min_salary, mid_salary, max_salary, currency) VALUES
  ('a9000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'L3', 'Engineer', 90000, 120000, 150000, 'USD'),
  ('a9000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'L4', 'Senior Engineer', 130000, 165000, 200000, 'USD'),
  ('a9000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'L5', 'Staff Engineer', 175000, 210000, 250000, 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO deals (id, organization_id, name, value, currency, stage, probability) VALUES
  ('aa000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Acme Corp — Enterprise', 48000, 'USD', 'proposal', 60),
  ('aa000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'Globex — Growth', 24000, 'USD', 'negotiation', 75)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dashboard_metrics (id, organization_id, key, label, value, delta, delta_label, spark, format, currency, position) VALUES
  ('ab000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'headcount', 'Headcount', 12, 3.2, 'vs last month', '{8,9,10,10,11,11,12}', 'number', NULL, 0),
  ('ab000000-0000-4000-8000-000000000002', '409458f5-d45b-486e-9a69-18997eabdc23', 'payroll', 'Monthly Payroll', 41500, 1.8, 'vs last month', '{39,40,40,41,41,41,41}', 'currency', 'USD', 1),
  ('ab000000-0000-4000-8000-000000000003', '409458f5-d45b-486e-9a69-18997eabdc23', 'pto', 'PTO Utilization', 68, -4.1, 'vs last month', '{74,72,71,70,70,69,68}', 'percent', NULL, 2),
  ('ab000000-0000-4000-8000-000000000004', '409458f5-d45b-486e-9a69-18997eabdc23', 'open_roles', 'Open Roles', 5, 2, 'new this month', '{2,3,3,4,4,5,5}', 'number', NULL, 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO job_postings (id, organization_id, title, department, location, status) VALUES
  ('ac000000-0000-4000-8000-000000000001', '409458f5-d45b-486e-9a69-18997eabdc23', 'Software Engineer', 'Engineering', 'Remote', 'open')
ON CONFLICT (id) DO NOTHING;

INSERT INTO candidate_evaluations (id, candidate_id, score, summary, recommendation) VALUES
  ('ad000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 78, 'Solid fundamentals; screen for a deeper technical round.', 'hold'),
  ('ad000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 86, 'Strong backend experience; advance to interview.', 'advance'),
  ('ad000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 91, 'Exceptional fit; schedule final round.', 'advance')
ON CONFLICT (id) DO NOTHING;
