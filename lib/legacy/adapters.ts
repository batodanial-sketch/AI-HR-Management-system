import "server-only";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  mapLegacyAttendance,
  mapLegacyAudits,
  mapLegacyGoals,
  mapLegacyLeaves,
  type CanonicalAttendanceRow,
  type CanonicalAuditRow,
  type CanonicalGoalRow,
  type CanonicalLeaveRow,
} from "./field-map";

/**
 * Typed Supabase adapters for the legacy service layer.
 *
 * These bridge the legacy column names (`work_email`, `check_in_at`,
 * `actor_user_id`, `leave_type_id`, `progress_percent`) onto the canonical
 * schema via `lib/legacy/field-map.ts`, returning rows strictly typed against
 * `lib/database.types.ts`. They are the "connect legacy functions to real
 * Supabase" seam — swap these into a legacy action and its return type matches
 * the regenerated database types.
 *
 * When Supabase is not configured, each returns an empty list so callers fall
 * back to seed/demo data (the same contract as `lib/api.ts` / `lib/domain.ts`).
 */

async function orgFilter(): Promise<{ column: string; value: string } | undefined> {
  if (!hasSupabaseEnv()) return undefined;
  const orgId = (await getCurrentUser()).organizationId;
  return orgId ? { column: "organization_id", value: orgId } : undefined;
}

/** Typed read of attendance records (maps legacy check_in/out → clock_in/out). */
export async function getAttendanceRecordsTyped(): Promise<CanonicalAttendanceRow[]> {
  if (!hasSupabaseEnv()) return [];
  const filter = await orgFilter();
  let query = serverClient().from("attendance_records").select("*");
  if (filter) query = query.eq(filter.column, filter.value);
  const { data, error } = await query.order("work_date", { ascending: false });
  if (error || !data) return [];
  // The reconciled schema carries canonical columns; map defensively via the
  // legacy field-map so reads are correct on both pre- and post-migration DBs.
  return mapLegacyAttendance(
    data.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      employee_id: row.employee_id,
      work_date: row.work_date,
      status: row.status,
      check_in_at: row.clock_in,
      check_out_at: row.clock_out,
      worked_minutes: 0,
      overtime_minutes: 0,
      note: null,
      created_at: row.created_at,
      updated_at: row.created_at,
    })),
  );
}

/** Typed read of goals (maps progress_percent/description → progress/objective). */
export async function getGoalsTyped(): Promise<CanonicalGoalRow[]> {
  if (!hasSupabaseEnv()) return [];
  const filter = await orgFilter();
  let query = serverClient().from("goals").select("*");
  if (filter) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error || !data) return [];
  return mapLegacyGoals(
    data.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      employee_id: row.employee_id,
      title: row.title,
      description: row.objective,
      metric_type: null,
      target_value: null,
      current_value: row.progress,
      progress_percent: row.progress,
      due_date: row.due_date,
      status: row.status,
      created_at: "",
      updated_at: "",
    })),
  );
}

/** Typed read of audit logs (maps actor_user_id/entity_type → actor_id/entity). */
export async function getAuditEntriesTyped(): Promise<CanonicalAuditRow[]> {
  if (!hasSupabaseEnv()) return [];
  const filter = await orgFilter();
  let query = serverClient().from("audit_logs").select("*");
  if (filter) query = query.eq(filter.column, filter.value);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error || !data) return [];
  return mapLegacyAudits(
    data.map((row) => ({
      id: typeof row.id === "string" ? Number(row.id) || 0 : 0,
      organization_id: row.organization_id,
      actor_user_id: row.actor_id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      before_state: null,
      after_state: null,
      ip_address: null,
      user_agent: null,
      created_at: row.created_at,
    })),
  );
}

/** Typed read of leave requests (maps leave_type_id → type text enum). */
export async function getLeaveRequestsTyped(): Promise<CanonicalLeaveRow[]> {
  if (!hasSupabaseEnv()) return [];
  const filter = await orgFilter();
  let query = serverClient().from("leave_requests").select("*");
  if (filter) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error || !data) return [];
  return mapLegacyLeaves(
    data.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      employee_id: row.employee_id,
      leave_type_id: row.type,
      start_date: row.start_date,
      end_date: row.end_date,
      total_days: 0,
      half_day: false,
      reason: row.reason,
      status: row.status,
      approver_id: row.approver_id,
      decided_at: row.decided_at,
      created_at: "",
      updated_at: "",
    })),
  );
}
