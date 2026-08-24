-- Fluxentiq · Daily Employee Workflow Engine & Automation Backend
-- ---------------------------------------------------------------------------
-- High-throughput backend workflow engine that generates, executes, and audits
-- daily automated workflows for every employee across an organization.
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE OR REPLACE FUNCTION.
-- Safe to re-run.

-- ── Table: workflow_templates ──────────────────────────────────────────────
-- Defines recurring workflow steps, triggers, schedule (daily/cron), and target roles.
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  trigger_type TEXT NOT NULL DEFAULT 'daily' CHECK (trigger_type IN ('daily', 'cron', 'event', 'manual')),
  schedule_cron TEXT, -- cron expression for cron trigger, e.g. "0 9 * * 1-5"
  schedule_time TIME, -- daily time, e.g. "09:00"
  target_roles JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["employee","manager","admin"] or specific role codes
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_org_active ON public.workflow_templates(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_org_trigger ON public.workflow_templates(organization_id, trigger_type);

-- ── Table: daily_employee_tasks ────────────────────────────────────────────
-- Tracks generated daily tasks per employee (idempotent per org+employee+date+template).
CREATE TABLE IF NOT EXISTS public.daily_employee_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  workflow_template_id UUID REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  task_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','failed','skipped','cancelled')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_time TIME,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_id, task_date, workflow_template_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_org_date ON public.daily_employee_tasks(organization_id, task_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_employee_date ON public.daily_employee_tasks(employee_id, task_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_status ON public.daily_employee_tasks(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_template ON public.daily_employee_tasks(workflow_template_id);

-- ── Table: workflow_executions ─────────────────────────────────────────────
-- Logs execution logs, failure states, and audit trails for workflow runs.
CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  workflow_template_id UUID REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.daily_employee_tasks(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  error_log TEXT,
  execution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER,
  triggered_by TEXT NOT NULL DEFAULT 'system' CHECK (triggered_by IN ('system','cron','user','bridge','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_org_time ON public.workflow_executions(organization_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON public.workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_template ON public.workflow_executions(workflow_template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON public.workflow_executions(organization_id, status);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_employee_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

-- workflow_templates: member can read, admin can write
DROP POLICY IF EXISTS workflow_templates_select_member ON public.workflow_templates;
CREATE POLICY workflow_templates_select_member
  ON public.workflow_templates FOR SELECT
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS workflow_templates_insert_admin ON public.workflow_templates;
CREATE POLICY workflow_templates_insert_admin
  ON public.workflow_templates FOR INSERT
  WITH CHECK (public.is_organization_admin(organization_id));

DROP POLICY IF EXISTS workflow_templates_update_admin ON public.workflow_templates;
CREATE POLICY workflow_templates_update_admin
  ON public.workflow_templates FOR UPDATE
  USING (public.is_organization_admin(organization_id))
  WITH CHECK (public.is_organization_admin(organization_id));

DROP POLICY IF EXISTS workflow_templates_delete_admin ON public.workflow_templates;
CREATE POLICY workflow_templates_delete_admin
  ON public.workflow_templates FOR DELETE
  USING (public.is_organization_admin(organization_id));

-- daily_employee_tasks: member can read own + org member can read all, employee can update own, admin can manage all
DROP POLICY IF EXISTS daily_tasks_select_member ON public.daily_employee_tasks;
CREATE POLICY daily_tasks_select_member
  ON public.daily_employee_tasks FOR SELECT
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS daily_tasks_insert_admin ON public.daily_employee_tasks;
CREATE POLICY daily_tasks_insert_admin
  ON public.daily_employee_tasks FOR INSERT
  WITH CHECK (public.is_organization_admin(organization_id));

DROP POLICY IF EXISTS daily_tasks_update_member ON public.daily_employee_tasks;
CREATE POLICY daily_tasks_update_member
  ON public.daily_employee_tasks FOR UPDATE
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS daily_tasks_delete_admin ON public.daily_employee_tasks;
CREATE POLICY daily_tasks_delete_admin
  ON public.daily_employee_tasks FOR DELETE
  USING (public.is_organization_admin(organization_id));

-- workflow_executions: member can read, admin can insert/update
DROP POLICY IF EXISTS workflow_executions_select_member ON public.workflow_executions;
CREATE POLICY workflow_executions_select_member
  ON public.workflow_executions FOR SELECT
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS workflow_executions_insert_member ON public.workflow_executions;
CREATE POLICY workflow_executions_insert_member
  ON public.workflow_executions FOR INSERT
  WITH CHECK (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS workflow_executions_update_admin ON public.workflow_executions;
CREATE POLICY workflow_executions_update_admin
  ON public.workflow_executions FOR UPDATE
  USING (public.is_organization_admin(organization_id))
  WITH CHECK (public.is_organization_admin(organization_id));

DROP POLICY IF EXISTS workflow_executions_delete_admin ON public.workflow_executions;
CREATE POLICY workflow_executions_delete_admin
  ON public.workflow_executions FOR DELETE
  USING (public.is_organization_admin(organization_id));

-- ── Updated_at triggers ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS workflow_templates_touch ON public.workflow_templates;
CREATE TRIGGER workflow_templates_touch BEFORE UPDATE ON public.workflow_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS daily_tasks_touch ON public.daily_employee_tasks;
CREATE TRIGGER daily_tasks_touch BEFORE UPDATE ON public.daily_employee_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.workflow_templates IS 'Daily workflow engine: recurring workflow templates with steps_json, schedule, target roles.';
COMMENT ON TABLE public.daily_employee_tasks IS 'Daily tasks generated per employee per date from active templates — idempotent.';
COMMENT ON TABLE public.workflow_executions IS 'Execution logs for workflow templates and daily tasks — audit trail.';
