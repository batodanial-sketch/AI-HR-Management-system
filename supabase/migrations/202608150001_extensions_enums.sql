-- Fluxentiq · 0001 — extensions + shared enums
-- ---------------------------------------------------------------------------
-- Enables required extensions and defines every enum used across the HR and
-- lead-intelligence (CRM) domains. Idempotent where possible.

create extension if not exists "pgcrypto";
create extension if not exists "pg_graphql";

-- ── Organizations & access ──────────────────────────────────────────────────
do $$ begin
  create type org_role as enum ('owner', 'admin', 'manager', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type org_plan as enum ('free', 'pro', 'enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type provisioning_status as enum ('provisioned', 'not_provisioned', 'ambiguous');
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_policy as enum ('allow_existing', 'require_invite', 'require_membership');
exception when duplicate_object then null; end $$;

do $$ begin
  create type access_request_status as enum ('pending', 'approved', 'denied');
exception when duplicate_object then null; end $$;

-- ── HR ──────────────────────────────────────────────────────────────────────
do $$ begin
  create type employment_status as enum ('active', 'on_leave', 'terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recruitment_stage as enum ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recommendation as enum ('advance', 'hold', 'reject');
exception when duplicate_object then null; end $$;

do $$ begin
  create type leave_type as enum ('pto', 'sick', 'unpaid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type leave_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payroll_run_status as enum ('draft', 'processing', 'completed', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type workflow_node_type as enum ('trigger', 'action', 'condition', 'delay');
exception when duplicate_object then null; end $$;

do $$ begin
  create type workflow_run_status as enum ('completed', 'failed', 'no_workflow');
exception when duplicate_object then null; end $$;

-- ── Lead intelligence (CRM) ─────────────────────────────────────────────────
do $$ begin
  create type lead_status as enum ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_stage as enum ('discovery', 'proposal', 'negotiation', 'closed_won', 'closed_lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_kind as enum ('approval', 'alert', 'info', 'workflow');
exception when duplicate_object then null; end $$;
