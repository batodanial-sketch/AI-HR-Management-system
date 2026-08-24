-- Fluxentiq AI HR
-- Supabase PostgreSQL canonical initial migration.
-- Derived from schema.sql; uses auth.users-backed public profiles and
-- Supabase-compatible membership RLS. Apply via `supabase db push`.

-- Fluxentiq / AI HR Management System
-- PostgreSQL 16+ multi-tenant schema
-- Generated for a portfolio SaaS demo; deploy through a migration runner in production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
-- Optional when semantic search is enabled:
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended', 'archived');
CREATE TYPE employment_status AS ENUM ('active', 'on_leave', 'probation', 'notice_period', 'terminated', 'archived');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'intern', 'consultant');
CREATE TYPE job_status AS ENUM ('draft', 'open', 'on_hold', 'closed', 'archived');
CREATE TYPE application_stage AS ENUM ('applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn');
CREATE TYPE interview_status AS ENUM ('planned', 'completed', 'cancelled', 'no_show');
CREATE TYPE leave_request_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent', 'remote', 'holiday', 'on_leave', 'weekend');
CREATE TYPE payroll_status AS ENUM ('draft', 'review', 'approved', 'paid', 'void');
CREATE TYPE document_status AS ENUM ('draft', 'generated', 'sent', 'signed', 'expired', 'void');
CREATE TYPE workflow_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE workflow_run_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE onboarding_status AS ENUM ('not_started', 'in_progress', 'completed', 'cancelled');
CREATE TYPE onboarding_task_status AS ENUM ('not_started', 'in_progress', 'blocked', 'completed', 'skipped');
CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'slack', 'webhook');
CREATE TYPE audit_action AS ENUM ('create', 'read', 'update', 'delete', 'export', 'login', 'logout', 'approve', 'reject', 'generate');

-- ---------------------------------------------------------------------------
-- Tenant, identity, and access control
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  slug CITEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#635BFF',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT NOT NULL DEFAULT 'en-US',
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  work_week SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan_code TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE users (
  -- Supabase profile row; identity and credentials live in auth.users.
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT, -- owned by the auth provider in production
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  status user_status NOT NULL DEFAULT 'invited',
  last_login_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  status user_status NOT NULL DEFAULT 'invited',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Organization directory and employee records
-- ---------------------------------------------------------------------------
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country_code CHAR(2),
  timezone TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_remote BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  head_employee_id UUID,
  name TEXT NOT NULL,
  code TEXT,
  cost_center TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  level TEXT,
  job_family TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  employee_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  work_email CITEXT NOT NULL,
  personal_email CITEXT,
  phone TEXT,
  date_of_birth DATE,
  pronouns TEXT,
  avatar_url TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  job_title_id UUID REFERENCES job_titles(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  employment_type employment_type NOT NULL DEFAULT 'full_time',
  status employment_status NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL,
  end_date DATE,
  emergency_contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, employee_number),
  UNIQUE (organization_id, work_email)
);

ALTER TABLE departments
  ADD CONSTRAINT departments_head_employee_fk
  FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE employment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  job_title_id UUID REFERENCES job_titles(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  employment_type employment_type NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compensation_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  currency_code CHAR(3) NOT NULL,
  annual_salary NUMERIC(14,2) NOT NULL CHECK (annual_salary >= 0),
  pay_frequency TEXT NOT NULL DEFAULT 'monthly',
  effective_from DATE NOT NULL,
  effective_to DATE,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  category TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Employee onboarding
-- ---------------------------------------------------------------------------
CREATE TABLE onboarding_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_days SMALLINT NOT NULL DEFAULT 30 CHECK (target_days > 0),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  template_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE onboarding_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  program_id UUID REFERENCES onboarding_programs(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  buddy_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  target_completion_date DATE,
  status onboarding_status NOT NULL DEFAULT 'not_started',
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, program_id)
);

CREATE TABLE onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES onboarding_enrollments(id) ON DELETE CASCADE,
  owner_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status onboarding_task_status NOT NULL DEFAULT 'not_started',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Recruitment, resumes, and AI scoring
-- ---------------------------------------------------------------------------
CREATE TABLE job_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  job_title_id UUID REFERENCES job_titles(id) ON DELETE SET NULL,
  hiring_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  recruiter_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  requisition_code TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  employment_type employment_type NOT NULL DEFAULT 'full_time',
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  remote_policy TEXT,
  min_salary NUMERIC(14,2),
  max_salary NUMERIC(14,2),
  currency_code CHAR(3),
  target_hire_date DATE,
  status job_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, requisition_code)
);

CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  source TEXT,
  consent_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  talent_pool_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  parsed_text TEXT,
  parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  parser_version TEXT,
  -- embedding vector(1536), -- enable with pgvector
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_opening_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  stage application_stage NOT NULL DEFAULT 'applied',
  source TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  hired_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_opening_id)
);

CREATE TABLE candidate_ai_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  overall_score NUMERIC(5,2) CHECK (overall_score BETWEEN 0 AND 100),
  job_match_score NUMERIC(5,2) CHECK (job_match_score BETWEEN 0 AND 100),
  experience_score NUMERIC(5,2) CHECK (experience_score BETWEEN 0 AND 100),
  skills_score NUMERIC(5,2) CHECK (skills_score BETWEEN 0 AND 100),
  education_score NUMERIC(5,2) CHECK (education_score BETWEEN 0 AND 100),
  recommendation TEXT,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  rationale TEXT,
  raw_response JSONB,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  interview_type TEXT NOT NULL,
  status interview_status NOT NULL DEFAULT 'planned',
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  meeting_url TEXT,
  timezone TEXT,
  scorecard JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE interview_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  external_email CITEXT,
  role TEXT NOT NULL DEFAULT 'interviewer',
  CHECK (employee_id IS NOT NULL OR external_email IS NOT NULL)
);
CREATE UNIQUE INDEX uq_interview_participants_employee
  ON interview_participants(interview_id, employee_id)
  WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX uq_interview_participants_email
  ON interview_participants(interview_id, external_email)
  WHERE external_email IS NOT NULL;

CREATE TABLE interview_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  interviewer_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  rating NUMERIC(3,1) CHECK (rating BETWEEN 1 AND 5),
  recommendation TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  strengths TEXT,
  concerns TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interview_id, interviewer_id)
);

-- ---------------------------------------------------------------------------
-- Attendance and leave
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  workday_start TIME,
  workday_end TIME,
  grace_minutes SMALLINT NOT NULL DEFAULT 0,
  overtime_after_minutes SMALLINT,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  status attendance_status NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  worked_minutes INTEGER NOT NULL DEFAULT 0 CHECK (worked_minutes >= 0),
  overtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
  source TEXT,
  note TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

CREATE TABLE attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#635BFF',
  annual_allowance NUMERIC(6,2),
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  requires_attachment BOOLEAN NOT NULL DEFAULT FALSE,
  paid BOOLEAN NOT NULL DEFAULT TRUE,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  balance_year INTEGER NOT NULL,
  opening_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  accrued_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  used_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  carried_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type_id, balance_year)
);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(6,2) NOT NULL CHECK (total_days > 0),
  half_day BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  attachment_key TEXT,
  status leave_request_status NOT NULL DEFAULT 'draft',
  approver_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  approver_note TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------
CREATE TABLE payroll_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pay_date DATE NOT NULL,
  currency_code CHAR(3) NOT NULL,
  status payroll_status NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payroll_cycle_id UUID NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  gross_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL,
  payment_status payroll_status NOT NULL DEFAULT 'draft',
  bank_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_cycle_id, employee_id)
);

CREATE TABLE payroll_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payroll_entry_id UUID NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL CHECK (line_type IN ('earning', 'deduction', 'employer_contribution', 'reimbursement')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  taxable BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Performance and engagement
-- ---------------------------------------------------------------------------
CREATE TABLE performance_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  self_review_due_at TIMESTAMPTZ,
  manager_review_due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  parent_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  performance_cycle_id UUID REFERENCES performance_cycles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  metric_type TEXT,
  target_value NUMERIC,
  current_value NUMERIC NOT NULL DEFAULT 0,
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  performance_cycle_id UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  overall_rating NUMERIC(3,1) CHECK (overall_rating BETWEEN 1 AND 5),
  summary TEXT,
  ai_summary TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (performance_cycle_id, employee_id, reviewer_id, review_type)
);

CREATE TABLE performance_review_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  performance_review_id UUID NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  answer TEXT,
  rating NUMERIC(3,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (performance_review_id, question_key)
);

CREATE TABLE feedback_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sentiment TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Documents, AI assistant, notifications, and automations
-- ---------------------------------------------------------------------------
CREATE TABLE document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  storage_key TEXT,
  content_html TEXT,
  status document_status NOT NULL DEFAULT 'draft',
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR candidate_id IS NOT NULL OR category = 'company')
);

CREATE TABLE assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  context_type TEXT,
  context_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_name TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status workflow_status NOT NULL DEFAULT 'active',
  last_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status workflow_run_status NOT NULL DEFAULT 'queued',
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx', 'pdf')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_key TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action audit_action NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Performance indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_memberships_org_user ON organization_memberships(organization_id, user_id);
CREATE INDEX idx_employees_org_status ON employees(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_department ON employees(organization_id, department_id);
CREATE INDEX idx_onboarding_enrollments_org_status ON onboarding_enrollments(organization_id, status, start_date DESC);
CREATE UNIQUE INDEX uq_active_onboarding_per_employee ON onboarding_enrollments(employee_id)
  WHERE status IN ('not_started', 'in_progress');
CREATE INDEX idx_onboarding_tasks_enrollment ON onboarding_tasks(enrollment_id, status, sort_order);
CREATE INDEX idx_job_openings_org_status ON job_openings(organization_id, status);
CREATE INDEX idx_applications_job_stage ON applications(job_opening_id, stage);
CREATE INDEX idx_applications_org_stage ON applications(organization_id, stage);
CREATE INDEX idx_candidate_assessments_application ON candidate_ai_assessments(application_id, created_at DESC);
CREATE INDEX idx_interviews_schedule ON interviews(organization_id, scheduled_start) WHERE status = 'planned';
CREATE INDEX idx_attendance_employee_date ON attendance_records(employee_id, work_date DESC);
CREATE INDEX idx_attendance_org_date ON attendance_records(organization_id, work_date DESC);
CREATE INDEX idx_leave_requests_approval ON leave_requests(organization_id, status, start_date);
CREATE INDEX idx_payroll_entries_cycle ON payroll_entries(payroll_cycle_id);
CREATE INDEX idx_goals_employee ON goals(employee_id, status);
CREATE INDEX idx_reviews_cycle_employee ON performance_reviews(performance_cycle_id, employee_id);
CREATE INDEX idx_documents_org_category ON documents(organization_id, category, created_at DESC);
CREATE INDEX idx_assistant_messages_conversation ON assistant_messages(conversation_id, created_at);
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Generic timestamp trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Keep onboarding enrollment progress and completion status in sync with task work.
CREATE OR REPLACE FUNCTION refresh_onboarding_progress() RETURNS TRIGGER AS $$
DECLARE
  target_enrollment UUID;
  total_tasks INTEGER;
  completed_tasks INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_enrollment := OLD.enrollment_id;
  ELSE
    target_enrollment := NEW.enrollment_id;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
    INTO total_tasks, completed_tasks
  FROM onboarding_tasks
  WHERE enrollment_id = target_enrollment;

  UPDATE onboarding_enrollments
  SET progress_percent = CASE
        WHEN total_tasks = 0 THEN 0
        ELSE ROUND((completed_tasks::NUMERIC / total_tasks::NUMERIC) * 100, 2)
      END,
      status = CASE
        WHEN total_tasks > 0 AND completed_tasks = total_tasks THEN 'completed'
        WHEN completed_tasks > 0 THEN 'in_progress'
        ELSE 'not_started'
      END,
      completed_at = CASE
        WHEN total_tasks > 0 AND completed_tasks = total_tasks THEN now()
        ELSE NULL
      END
  WHERE id = target_enrollment
    AND status <> 'cancelled';

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER memberships_touch BEFORE UPDATE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER departments_touch BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER employees_touch BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER compensation_touch BEFORE UPDATE ON compensation_packages FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER onboarding_programs_touch BEFORE UPDATE ON onboarding_programs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER onboarding_enrollments_touch BEFORE UPDATE ON onboarding_enrollments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER onboarding_tasks_touch BEFORE UPDATE ON onboarding_tasks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER onboarding_progress_after_task
  AFTER INSERT OR UPDATE OR DELETE ON onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION refresh_onboarding_progress();
CREATE TRIGGER jobs_touch BEFORE UPDATE ON job_openings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER candidates_touch BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER resumes_touch BEFORE UPDATE ON resumes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER applications_touch BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER interviews_touch BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER attendance_touch BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER leave_touch BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER payroll_cycles_touch BEFORE UPDATE ON payroll_cycles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER payroll_entries_touch BEFORE UPDATE ON payroll_entries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER goals_touch BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER reviews_touch BEFORE UPDATE ON performance_reviews FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER templates_touch BEFORE UPDATE ON document_templates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER documents_touch BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER conversations_touch BEFORE UPDATE ON assistant_conversations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER workflows_touch BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Supabase Auth + tenant Row Level Security
-- ---------------------------------------------------------------------------
-- Supabase JWT identity is auth.uid(). Client-facing tenant access is resolved
-- through active organization memberships; service_role bypasses RLS for jobs.
CREATE OR REPLACE FUNCTION public.is_organization_member(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    WHERE membership.organization_id = target_organization_id
      AND membership.user_id = auth.uid()
      AND membership.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, status, metadata)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    'active',
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        metadata = EXCLUDED.metadata;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select_for_members
  ON public.organizations FOR SELECT
  USING (public.is_organization_member(id));

CREATE POLICY users_select_own_profile
  ON public.users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY users_update_own_profile
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- All tables with organization_id use membership-bound tenant isolation.
DO $$
DECLARE
  tenant_table TEXT;
BEGIN
  FOR tenant_table IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = n.nspname
     AND col.table_name = c.relname
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND col.column_name = 'organization_id'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id))',
      tenant_table
    );
  END LOOP;
END;
$$;

-- Browser clients may read their own memberships. Organization admin writes
-- are performed through server routes using service_role, never direct anon SQL.
CREATE POLICY memberships_select_self_or_org_member
  ON public.organization_memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_organization_member(organization_id));
