-- Fluxentiq · Enable Row-Level Security on Core Tables
-- This migration ensures RLS is enabled on core business tables with proper tenant isolation

-- Enable RLS and set up policies for core tables that might have been missed
-- Using the established is_organization_member() function for tenant isolation

DO $$
DECLARE
    core_tables TEXT[] := ARRAY[
        'employees',
        'payroll_runs',
        'payroll_line_items',
        'departments',
        'job_titles',
        'locations',
        'employment_history',
        'compensation_packages',
        'employee_files',
        'onboarding_programs',
        'onboarding_enrollments',
        'onboarding_tasks',
        'job_openings',
        'candidates',
        'resumes',
        'interviews',
        'applications',
        'candidate_ai_assessments',
        'interview_participants',
        'interview_feedback',
        'attendance_policies',
        'attendance_records',
        'attendance_events',
        'leave_types',
        'leave_balances',
        'leave_requests',
        'payroll_cycles',
        'payroll_entries',
        'payroll_line_items',
        'performance_cycles',
        'goals',
        'performance_reviews',
        'performance_review_answers',
        'feedback_notes',
        'document_templates',
        'documents',
        'assistant_conversations',
        'assistant_messages',
        'workflows',
        'workflow_runs',
        'notifications',
        'report_exports',
        'audit_logs',
        'organizations',
        'users',
        'organization_memberships',
        'roles',
        'api_keys',
        'locations',
        'departments',
        'job_titles',
        'currency_rates',
        'contractors',
        'contractor_invoices',
        'benefit_plans',
        'benefit_enrollments',
        'benefit_dependents',
        'equity_grants',
        'equity_vesting_events',
        'compensation_bands',
        'bonus_awards',
        'workflow_versions',
        'workflow_approvals'
    ];

    table_name TEXT;
BEGIN
    -- Enable RLS and create policies for each core table
    FOREACH table_name IN ARRAY core_tables
    LOOP
        -- Enable RLS on the table
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

        -- Drop existing tenant_isolation policy if it exists to avoid conflicts
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', table_name);

        -- Create tenant isolation policy using the established is_organization_member function
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I FOR ALL USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id))',
            table_name
        );
    END LOOP;
END $$;

-- Special handling for tables without organization_id but with user_id
-- These should use auth.uid() for user-specific access

DO $$
DECLARE
    user_tables TEXT[] := ARRAY[
        'users'
    ];

    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY user_tables
    LOOP
        -- Enable RLS on the table
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

        -- Drop existing user-specific policies if they exist
        EXECUTE format('DROP POLICY IF EXISTS user_isolation ON public.%I', table_name);

        -- Create user isolation policy
        EXECUTE format(
            'CREATE POLICY user_isolation ON public.%I FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid())',
            table_name
        );
    END LOOP;
END $$;

-- Special handling for organization_memberships which needs both user and org access
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_access ON public.organization_memberships;
CREATE POLICY memberships_access ON public.organization_memberships
    FOR ALL USING (
        user_id = auth.uid() OR
        public.is_organization_member(organization_id)
    )
    WITH CHECK (
        user_id = auth.uid() OR
        public.is_organization_member(organization_id)
    );

-- Special handling for audit_logs which might need broader access for admins
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_access ON public.audit_logs;
CREATE POLICY audit_logs_access ON public.audit_logs
    FOR ALL USING (public.is_organization_member(organization_id))
    WITH CHECK (public.is_organization_member(organization_id));