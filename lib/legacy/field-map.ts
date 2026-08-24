/**
 * Legacy → canonical field-mapping adapter.
 *
 * The enterprise codebase's service layer (`src/services/`, `app/actions/`)
 * was written against a legacy Supabase schema whose column names differ from
 * the reconciled canonical schema in `lib/database.types.ts`. This module is
 * the single source of truth for those differences, with typed row-transform
 * functions that convert legacy-shaped records into canonical rows.
 *
 * Mapping summary (legacy → canonical):
 *   employees.work_email      → employees.email
 *   employees.status          → employees.employment_status
 *   employees.department_id   → employees.department  (FK UUID → text)
 *   employees.job_title_id    → employees.title       (FK UUID → text)
 *   employees.location_id     → employees.location    (FK UUID → text)
 *   candidates.stage/score    → (moved to candidate_ai_assessments)
 *   audit_logs.actor_user_id  → audit_logs.actor_id
 *   audit_logs.before/after   → audit_logs.metadata (JSONB merge)
 *   audit_logs.entity_type    → audit_logs.entity
 *   audit_logs.action enum    → canonical free-text action
 *   leave_requests.leave_type_id → leave_requests.type (text enum)
 *   goals.progress_percent    → goals.progress
 *   goals.description         → goals.objective
 *   attendance_records.check_in_at  → attendance_records.clock_in
 *   attendance_records.check_out_at → attendance_records.clock_out
 *
 * These transforms let the legacy functions be adapted onto the canonical
 * schema without rewriting their business logic — and document, in types, the
 * reconciliation performed in `supabase/RECONCILIATION.md`.
 */

import type { EmploymentStatus, Json } from "@/lib/database.types";

/* ------------------------------------------------------------------ */
/* Legacy row shapes (mirrors src/lib/database.types.ts)               */
/* ------------------------------------------------------------------ */

export interface LegacyEmployeeRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  work_email: string;
  personal_email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  department_id: string | null;
  job_title_id: string | null;
  manager_id: string | null;
  location_id: string | null;
  employment_type: string;
  status: string;
  start_date: string;
  end_date: string | null;
  emergency_contact: Json;
  custom_fields: Json;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LegacyAuditRow {
  id: number;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_state: Json | null;
  after_state: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface LegacyLeaveRow {
  id: string;
  organization_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  half_day: boolean;
  reason: string | null;
  status: string;
  approver_id: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegacyGoalRow {
  id: string;
  organization_id: string;
  employee_id: string;
  title: string;
  description: string | null;
  metric_type: string | null;
  target_value: number | null;
  current_value: number;
  progress_percent: number;
  due_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LegacyAttendanceRow {
  id: string;
  organization_id: string;
  employee_id: string;
  work_date: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  worked_minutes: number;
  overtime_minutes: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/* Canonical row shapes (mirrors lib/database.types.ts Row types)      */
/* ------------------------------------------------------------------ */

export interface CanonicalEmployeeRow {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string | null;
  role: string | null;
  title: string | null;
  employment_status: EmploymentStatus;
  start_date: string | null;
  location: string | null;
  manager_id: string | null;
  source_tag: string | null;
}

export interface CanonicalAuditRow {
  id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface CanonicalLeaveRow {
  id: string;
  organization_id: string;
  employee_id: string;
  employee_name: string | null;
  type: "pto" | "sick" | "unpaid";
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  source_tag: string | null;
}

export interface CanonicalGoalRow {
  id: string;
  organization_id: string;
  employee_id: string;
  title: string;
  objective: string | null;
  status: string;
  progress: number;
  due_date: string | null;
}

export interface CanonicalAttendanceRow {
  id: string;
  organization_id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
}

/* ------------------------------------------------------------------ */
/* Transform functions                                                 */
/* ------------------------------------------------------------------ */

const EMPLOYMENT_STATUS_MAP: Record<string, EmploymentStatus> = {
  active: "active",
  on_leave: "on_leave",
  terminated: "terminated",
  archived: "terminated",
  probation: "active",
  notice_period: "active",
};

/** Maps a legacy employee row to the canonical `employees` row shape. */
export function mapLegacyEmployee(row: LegacyEmployeeRow): CanonicalEmployeeRow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.work_email,
    department: row.department_id, // FK id; canonical `department` is a display string
    role: row.employment_type,
    title: row.job_title_id ?? null, // FK id; canonical `title` is a display string
    employment_status: EMPLOYMENT_STATUS_MAP[row.status] ?? "active",
    start_date: row.start_date,
    location: row.location_id, // FK id; canonical `location` is a display string
    manager_id: row.manager_id,
    source_tag: null,
  };
}

/** Maps a legacy audit row to the canonical `audit_logs` row shape. */
export function mapLegacyAudit(row: LegacyAuditRow): CanonicalAuditRow {
  return {
    id: String(row.id),
    organization_id: row.organization_id,
    actor_id: row.actor_user_id,
    action: row.action,
    entity: row.entity_type,
    entity_id: row.entity_id,
    metadata: {
      before_state: row.before_state,
      after_state: row.after_state,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
    },
    created_at: row.created_at,
  };
}

const LEAVE_STATUS_MAP: Record<string, CanonicalLeaveRow["status"]> = {
  draft: "pending",
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  cancelled: "rejected",
};

/** Maps a legacy leave row to the canonical `leave_requests` row shape. */
export function mapLegacyLeave(row: LegacyLeaveRow): CanonicalLeaveRow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    employee_id: row.employee_id,
    employee_name: null,
    // Legacy used a leave_type FK; canonical uses a text enum. Without a join
    // to `leave_types`, default to "pto" (callers can override post-transform).
    type: "pto",
    start_date: row.start_date,
    end_date: row.end_date,
    reason: row.reason,
    status: LEAVE_STATUS_MAP[row.status] ?? "pending",
    source_tag: null,
  };
}

/** Maps a legacy goal row to the canonical `goals` row shape. */
export function mapLegacyGoal(row: LegacyGoalRow): CanonicalGoalRow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    employee_id: row.employee_id,
    title: row.title,
    objective: row.description,
    status: row.status,
    progress: row.progress_percent,
    due_date: row.due_date,
  };
}

/** Maps a legacy attendance row to the canonical `attendance_records` shape. */
export function mapLegacyAttendanceRow(row: LegacyAttendanceRow): CanonicalAttendanceRow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    employee_id: row.employee_id,
    work_date: row.work_date,
    clock_in: row.check_in_at,
    clock_out: row.check_out_at,
    status: row.status,
  };
}

/** Bulk transform helpers for service-layer adaptation. */
export function mapLegacyEmployees(rows: LegacyEmployeeRow[]): CanonicalEmployeeRow[] {
  return rows.map(mapLegacyEmployee);
}
export function mapLegacyAudits(rows: LegacyAuditRow[]): CanonicalAuditRow[] {
  return rows.map(mapLegacyAudit);
}
export function mapLegacyLeaves(rows: LegacyLeaveRow[]): CanonicalLeaveRow[] {
  return rows.map(mapLegacyLeave);
}
export function mapLegacyGoals(rows: LegacyGoalRow[]): CanonicalGoalRow[] {
  return rows.map(mapLegacyGoal);
}
export function mapLegacyAttendance(rows: LegacyAttendanceRow[]): CanonicalAttendanceRow[] {
  return rows.map(mapLegacyAttendanceRow);
}
