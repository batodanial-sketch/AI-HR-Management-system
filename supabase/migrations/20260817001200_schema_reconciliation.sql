-- Fluxentiq · 0012 — schema reconciliation
-- ---------------------------------------------------------------------------
-- Runs LAST. Adds every column the running app (lib/api.ts, lib/actions.ts,
-- lib/domain.ts) requires onto the shared core tables, so the unified schema
-- serves the app regardless of which migration originally created each table.
-- Idempotent + non-destructive (ADD COLUMN IF NOT EXISTS).

-- ── organizations ───────────────────────────────────────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'trialing';

-- ── employees ───────────────────────────────────────────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS source_tag TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active';

-- ── candidates ──────────────────────────────────────────────────────────────
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_posting_id UUID;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS match_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_url TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source_tag TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'applied';

-- ── audit_logs ──────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── notifications ───────────────────────────────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;

-- ── leave_requests ──────────────────────────────────────────────────────────
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS source_tag TEXT;

-- ── leave_balances ──────────────────────────────────────────────────────────
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS used_days NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS source_tag TEXT;

-- ── payroll_line_items ──────────────────────────────────────────────────────
ALTER TABLE payroll_line_items ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE payroll_line_items ADD COLUMN IF NOT EXISTS gross_pay NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE payroll_line_items ADD COLUMN IF NOT EXISTS deductions NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE payroll_line_items ADD COLUMN IF NOT EXISTS net_pay NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE payroll_line_items ADD COLUMN IF NOT EXISTS source_tag TEXT;

-- ── workflows / workflow_runs ───────────────────────────────────────────────
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS trigger_event TEXT;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS executed_actions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS error TEXT;

-- ── payroll_runs (total fields our payroll module reads) ───────────────────
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_gross NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_deductions NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_net NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS source_tag TEXT;

-- ── job_postings (recruitment kanban) ───────────────────────────────────────
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS source_tag TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

-- ── leads / deals (CRM) ─────────────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS value NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'discovery';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS probability INTEGER NOT NULL DEFAULT 20;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_date DATE;
