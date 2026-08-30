-- Fluxentiq · 20260830 — Module backend columns + default seed data
-- ---------------------------------------------------------------------------
-- Purpose: make every extended HR module fully backend-driven.
--
--  1. ADD COLUMN IF NOT EXISTS — legacy/denormalized display columns the
--     `lib/domain.ts` getters read (employee_name, currency, responses, enps,
--     headcount/budget forecasts, tasks_done/tasks_total, assignee, document
--     name/kind/owner/size, screening candidate_name/role/score/reviewed_at).
--     Idempotent + non-destructive, matching the reconciliation convention
--     in `20260817001200_schema_reconciliation.sql`.
--
--  2. Seed default rows for the demo organization ONLY (tables without
--     hard employee/candidate FK requirements). Every other organization
--     starts clean; when their tables are unpopulated the domain getters
--     fall back to the same deterministic defaults at read time, so pages
--     are never blank.
--
--     FK-bound tables (equity_grants, expense_reports, offboarding_cases,
--     contractor_invoices, candidate_ai_assessments) cannot be seeded
--     without parent employee/candidate/contractor rows and are covered by
--     the runtime domain fallback instead.
-- ---------------------------------------------------------------------------

-- ── 1. Legacy/denormalized display columns ────────────────────────────────

ALTER TABLE public.benefit_plans
  ADD COLUMN IF NOT EXISTS employee_name TEXT;

ALTER TABLE public.equity_grants
  ADD COLUMN IF NOT EXISTS employee_name TEXT;

ALTER TABLE public.expense_reports
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS responses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enps NUMERIC(6, 2);

ALTER TABLE public.workforce_scenarios
  ADD COLUMN IF NOT EXISTS headcount_forecast NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS budget_forecast NUMERIC(14, 2);

ALTER TABLE public.contractor_invoices
  ADD COLUMN IF NOT EXISTS contractor TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.offboarding_cases
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS exit_date DATE,
  ADD COLUMN IF NOT EXISTS tasks_done INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS assignee TEXT;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT,
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS size_kb INTEGER,
  ADD COLUMN IF NOT EXISTS uploaded_at DATE;

ALTER TABLE public.candidate_ai_assessments
  ADD COLUMN IF NOT EXISTS candidate_name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS score NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS reviewed_at DATE;

-- ── 2. Demo-organization default seeds (idempotent) ───────────────────────

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
    RAISE NOTICE 'module_backend_seeds: no demo organization found — skipping seed inserts';
    RETURN;
  END IF;

  -- Benefits
  INSERT INTO public.benefit_plans
    (organization_id, name, provider, plan_type, employee_cost, employer_cost, status)
  SELECT demo_org, 'Health — PPO', 'BlueShield', 'medical', 180, 620, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.benefit_plans WHERE organization_id = demo_org);

  INSERT INTO public.benefit_plans
    (organization_id, name, provider, plan_type, employee_cost, employer_cost, status)
  SELECT demo_org, 'Dental', 'DeltaDental', 'dental', 35, 120, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.benefit_plans WHERE organization_id = demo_org);

  INSERT INTO public.benefit_plans
    (organization_id, name, provider, plan_type, employee_cost, employer_cost, status)
  SELECT demo_org, '401(k) Match', 'Fidelity', 'retirement', 0, 240, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM public.benefit_plans WHERE organization_id = demo_org);

  -- Pulse surveys (seed 'active' maps to the schema's 'published')
  INSERT INTO public.pulse_surveys
    (organization_id, title, anonymous, status, responses, enps)
  SELECT demo_org, 'Q2 Engagement Pulse', TRUE, 'published', 84, 42
  WHERE NOT EXISTS (SELECT 1 FROM public.pulse_surveys WHERE organization_id = demo_org);

  INSERT INTO public.pulse_surveys
    (organization_id, title, anonymous, status, responses, enps)
  SELECT demo_org, 'Return-to-office sentiment', TRUE, 'closed', 110, 18
  WHERE NOT EXISTS (SELECT 1 FROM public.pulse_surveys WHERE organization_id = demo_org);

  INSERT INTO public.pulse_surveys
    (organization_id, title, anonymous, status, responses, enps)
  SELECT demo_org, 'Manager effectiveness', FALSE, 'draft', 0, NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.pulse_surveys WHERE organization_id = demo_org);

  -- Workforce planning scenarios ('approved' seed maps to 'active')
  INSERT INTO public.workforce_scenarios
    (organization_id, name, status, headcount_forecast, budget_forecast, assumptions)
  SELECT demo_org, 'Base case', 'active', 132, 910000,
         '{"headcountForecast": 132, "budgetForecast": 910000}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.workforce_scenarios WHERE organization_id = demo_org);

  INSERT INTO public.workforce_scenarios
    (organization_id, name, status, headcount_forecast, budget_forecast, assumptions)
  SELECT demo_org, 'Growth +20%', 'draft', 154, 1080000,
         '{"headcountForecast": 154, "budgetForecast": 1080000}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.workforce_scenarios WHERE organization_id = demo_org);

  INSERT INTO public.workforce_scenarios
    (organization_id, name, status, headcount_forecast, budget_forecast, assumptions)
  SELECT demo_org, 'Hiring freeze', 'draft', 126, 860000,
         '{"headcountForecast": 126, "budgetForecast": 860000}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.workforce_scenarios WHERE organization_id = demo_org);

  -- Assets
  INSERT INTO public.assets
    (organization_id, asset_tag, name, category, status, assignee)
  SELECT demo_org, 'AST-001', 'MacBook Pro 14', 'Laptop', 'assigned', 'Ayesha Rahman'
  WHERE NOT EXISTS (SELECT 1 FROM public.assets WHERE organization_id = demo_org);

  INSERT INTO public.assets
    (organization_id, asset_tag, name, category, status, assignee)
  SELECT demo_org, 'AST-002', 'Dell UltraSharp 27', 'Monitor', 'assigned', 'Miguel Torres'
  WHERE NOT EXISTS (SELECT 1 FROM public.assets WHERE organization_id = demo_org);

  INSERT INTO public.assets
    (organization_id, asset_tag, name, category, status, assignee)
  SELECT demo_org, 'AST-003', 'YubiKey 5C', 'Security', 'available', NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.assets WHERE organization_id = demo_org);

  INSERT INTO public.assets
    (organization_id, asset_tag, name, category, status, assignee)
  SELECT demo_org, 'AST-004', 'Sony WH-1000XM5', 'Peripheral', 'maintenance', NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.assets WHERE organization_id = demo_org);

  -- Documents (status column omitted — schema default 'draft' applies)
  INSERT INTO public.documents
    (organization_id, name, kind, owner, size_kb, uploaded_at, title, category)
  SELECT demo_org, 'Employee Handbook 2025.pdf', 'policy', 'People Ops', 1240, '2025-01-15',
         'Employee Handbook 2025.pdf', 'policy'
  WHERE NOT EXISTS (SELECT 1 FROM public.documents WHERE organization_id = demo_org);

  INSERT INTO public.documents
    (organization_id, name, kind, owner, size_kb, uploaded_at, title, category)
  SELECT demo_org, 'Offer Letter Template.docx', 'template', 'Recruitment', 96, '2025-02-03',
         'Offer Letter Template.docx', 'template'
  WHERE NOT EXISTS (SELECT 1 FROM public.documents WHERE organization_id = demo_org);

  INSERT INTO public.documents
    (organization_id, name, kind, owner, size_kb, uploaded_at, title, category)
  SELECT demo_org, 'Onboarding Checklist.pdf', 'checklist', 'People Ops', 310, '2025-03-01',
         'Onboarding Checklist.pdf', 'checklist'
  WHERE NOT EXISTS (SELECT 1 FROM public.documents WHERE organization_id = demo_org);

  RAISE NOTICE 'module_backend_seeds: default rows ensured for demo org %', demo_org;
END
$$;
