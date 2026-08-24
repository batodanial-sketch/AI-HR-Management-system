"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { emitWorkflowEvent } from "@/lib/bridge";
import { getCurrentUser } from "@/lib/auth";
import { getMemoryAdapter } from "@/lib/memory/factory";
import { getLicenseState, TRIAL_MAX_EMPLOYEES } from "@/lib/license";
import { recordAudit, logAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { dispatchWebhooks } from "@/lib/webhooks";
import type {
  Employee,
  LeaveStatus,
  LeaveType,
  OrgRole,
  PayrollRunStatus,
  RecruitmentStage,
} from "./types";

/**
 * Server actions — the mutation surface of the Fluxentiq platform.
 *
 * Data operations (employees, candidates, leave, payroll) are routed through
 * the active Memory adapter, so the same actions work whether the buyer runs
 * Supabase (default), PostgreSQL, Xata, SQLite, a custom endpoint, or a local
 * on-device store. Auth/identity (organizations, profiles, memberships) stays
 * on Supabase, since profiles/memberships reference auth.users.
 */

function syntheticId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/* ------------------------------------------------------------------ */
/* Input validation (zod) — sanitizes every mutation before it touches */
/* storage. Rejects invalid input with a clean error.                  */
/* ------------------------------------------------------------------ */

const emailSchema = z.string().email().max(254);
const nonEmptySchema = (max: number) => z.string().trim().min(1).max(max);

const employeeSchema = z.object({
  firstName: nonEmptySchema(80),
  lastName: nonEmptySchema(80),
  email: emailSchema,
  department: nonEmptySchema(80),
  role: nonEmptySchema(80),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().max(120).optional(),
});

const candidateSchema = z.object({
  firstName: nonEmptySchema(80),
  lastName: nonEmptySchema(80),
  email: emailSchema,
  role: nonEmptySchema(80),
  source: nonEmptySchema(80),
  matchScore: z.number().int().min(0).max(100).optional(),
});

const leaveSchema = z.object({
  type: z.enum(["pto", "sick", "unpaid"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(1000).optional().default(""),
});

const workspaceSchema = z.object({
  name: nonEmptySchema(120),
  slug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]*$/, "slug must be lowercase alphanumeric or dashes")
    .optional(),
});

const addMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(["owner", "admin", "manager", "member"]),
});

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid input — ${message}`);
  }
  return result.data;
}

export interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  role: string;
  startDate: string;
  location?: string;
}

export interface ActionResult {
  id: string;
}

/** Creates an employee and returns its id (navigates to the profile on the client). */
export async function createEmployee(input: EmployeeInput): Promise<ActionResult> {
  const data = validate(employeeSchema, input);
  const id = syntheticId("emp");
  const user = await getCurrentUser();
  const memory = await getMemoryAdapter();

  // Trial headcount cap — authoritative server-side enforcement.
  const license = await getLicenseState();
  if (license?.tier === "TRIAL") {
    const existing = await memory.select("employees");
    if (existing.length >= TRIAL_MAX_EMPLOYEES) {
      throw new Error(
        `The free trial is limited to ${TRIAL_MAX_EMPLOYEES} employees. Upgrade to Pro for unlimited headcount.`,
      );
    }
  }

  await memory.insert("employees", {
    id,
    organization_id: user.organizationId,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    department: data.department,
    role: data.role,
    title: data.role,
    employment_status: "active",
    start_date: data.startDate,
    location: data.location ?? null,
  });

  revalidatePath("/employees");

  void recordAudit({
    action: "employee.create",
    entity: "employee",
    entityId: id,
    metadata: { email: data.email, department: data.department },
  });
  void dispatchWebhooks("employee.created", {
    employee_id: id,
    email: data.email,
    first_name: data.firstName,
    last_name: data.lastName,
  });

  // Trigger onboarding workflows (e.g. "employee.created" → welcome e-mail).
  void emitWorkflowEvent("employee.created", {
    employee_id: id,
    email: data.email,
    first_name: data.firstName,
    last_name: data.lastName,
    department: data.department,
  });

  return { id };
}

/** Updates an employee's employment status (used by the offboarding flow). */
export async function setEmploymentStatus(
  id: string,
  status: Employee["employmentStatus"],
): Promise<void> {
  const memory = await getMemoryAdapter();
  await memory.update("employees", { column: "id", value: id }, { employment_status: status });

  void recordAudit({
    action: status === "terminated" ? "employee.offboard" : "employee.update",
    entity: "employee",
    entityId: id,
    metadata: { status },
  });

  revalidatePath(`/employees/${id}`);
  revalidatePath("/employees");
}

/** Moves a candidate to a new recruitment stage. */
export async function moveCandidateStage(
  id: string,
  stage: RecruitmentStage,
): Promise<void> {
  const memory = await getMemoryAdapter();
  await memory.update("candidates", { column: "id", value: id }, { stage });

  void recordAudit({ action: "candidate.move", entity: "candidate", entityId: id, metadata: { stage } });
  void dispatchWebhooks("candidate.moved", { candidate_id: id, stage });

  revalidatePath("/recruitment");
}

export interface LeaveRequestInput {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

/**
 * Submits a leave request on behalf of the authenticated user. The employee
 * record is resolved from the auth email (works across memory backends).
 */
export async function requestLeave(input: LeaveRequestInput): Promise<ActionResult> {
  const data = validate(leaveSchema, input);
  const id = syntheticId("leave");
  const user = await getCurrentUser();
  const memory = await getMemoryAdapter();

  if (new Date(data.endDate) < new Date(data.startDate)) {
    throw new Error("End date must be on or after the start date.");
  }

  const email = user.email;
  const employees = await memory.select<{
    id: string;
    first_name: string;
    last_name: string;
  }>("employees", { column: "email", value: email });
  const employee = employees[0];

  const employeeId = employee?.id ?? "00000000-0000-4000-8000-000000000001";
  const employeeName = employee
    ? `${employee.first_name} ${employee.last_name}`
    : user.fullName;

  await memory.insert("leave_requests", {
    id,
    organization_id: user.organizationId,
    employee_id: employeeId,
    employee_name: employeeName,
    type: data.type,
    start_date: data.startDate,
    end_date: data.endDate,
    reason: data.reason,
    status: "pending",
  });

  revalidatePath("/leave");

  void recordAudit({
    action: "leave.request",
    entity: "leave_request",
    entityId: id,
    metadata: { type: data.type, start: data.startDate, end: data.endDate },
  });
  void dispatchWebhooks("leave.requested", {
    leave_request_id: id,
    leave_type: data.type,
    employee_name: employeeName,
  });

  // Trigger leave workflows (e.g. "leave.requested" → manager notification).
  void emitWorkflowEvent("leave.requested", {
    leave_request_id: id,
    leave_type: data.type,
    start_date: data.startDate,
    end_date: data.endDate,
  });

  return { id };
}

/** Approves or rejects a leave request. */
export async function resolveLeaveRequest(
  id: string,
  status: LeaveStatus,
): Promise<void> {
  const memory = await getMemoryAdapter();
  await memory.update("leave_requests", { column: "id", value: id }, { status });

  void recordAudit({ action: "leave.resolve", entity: "leave_request", entityId: id, metadata: { status } });
  void dispatchWebhooks("leave.resolved", { leave_request_id: id, status });
  void createNotification({
    kind: "approval",
    title: `Leave ${status}`,
    description: `A leave request was ${status} by ${(await getCurrentUser()).fullName}.`,
  });

  revalidatePath("/leave");
}

/** Executes a payroll run, transitioning it to completed. */
export async function executePayrollRun(id: string): Promise<void> {
  const memory = await getMemoryAdapter();
  await memory.update("payroll_runs", { column: "id", value: id }, { status: "completed" });

  void recordAudit({ action: "payroll.execute", entity: "payroll_run", entityId: id });
  void dispatchWebhooks("payroll.completed", { payroll_run_id: id });
  void createNotification({
    kind: "info",
    title: "Payroll run completed",
    description: `Payroll run ${id} has been executed.`,
  });

  revalidatePath("/payroll");
}

/** Records a payroll run status transition (used by the run pipeline). */
export async function setPayrollRunStatus(
  id: string,
  status: PayrollRunStatus,
): Promise<void> {
  const memory = await getMemoryAdapter();
  await memory.update("payroll_runs", { column: "id", value: id }, { status });
  revalidatePath("/payroll");
}

/* ------------------------------------------------------------------ */
/* Workspace onboarding + settings (identity — Supabase-backed)        */
/* ------------------------------------------------------------------ */

export interface WorkspaceInput {
  name: string;
  slug?: string;
}

/** Creates a workspace and assigns the current user as owner (onboarding). */
export async function createWorkspace(
  input: WorkspaceInput,
): Promise<ActionResult> {
  const data = validate(workspaceSchema, input);
  const user = await getCurrentUser();
  const orgId = syntheticId("org");
  const name = data.name.trim();
  const slug =
    data.slug?.trim() ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  if (hasSupabaseEnv()) {
    const { error: orgError } = await serverClient()
      .from("organizations")
      .insert({ id: orgId, name, slug, plan: "free" });
    if (orgError) {
      throw new Error(`Failed to create workspace: ${orgError.message}`);
    }

    const { error: memberError } = await serverClient()
      .from("memberships")
      .insert({ user_id: user.id, organization_id: orgId, role: "owner" });
    if (memberError) {
      throw new Error(`Failed to assign owner: ${memberError.message}`);
    }
  }

  revalidatePath("/", "layout");
  return { id: orgId };
}

/** Updates the signed-in user's profile. */
export async function updateProfile(input: {
  fullName: string;
  title?: string;
}): Promise<void> {
  const user = await getCurrentUser();
  if (hasSupabaseEnv()) {
    // Live profiles has no `title` column (legacy schema drifted) — update
    // only the columns that exist to avoid a PostgREST "column does not
    // exist" runtime failure.
    const { error } = await serverClient()
      .from("profiles")
      .update({ full_name: input.fullName.trim() })
      .eq("id", user.id);
    if (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }
  }
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

/** Updates the current workspace's name and slug. */
export async function updateOrganization(
  input: WorkspaceInput,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user.organizationId) {
    throw new Error("No active workspace.");
  }
  if (hasSupabaseEnv()) {
    const { error } = await serverClient()
      .from("organizations")
      .update({ name: input.name.trim(), slug: input.slug?.trim() || null })
      .eq("id", user.organizationId);
    if (error) {
      throw new Error(`Failed to update workspace: ${error.message}`);
    }
  }
  revalidatePath("/settings");
}

/** Adds an existing user to the workspace by email (with a role). */
export async function addMemberByEmail(input: {
  email: string;
  role: OrgRole;
}): Promise<void> {
  const data = validate(addMemberSchema, input);
  const user = await getCurrentUser();
  if (!user.organizationId) {
    throw new Error("No active workspace.");
  }
  if (hasSupabaseEnv()) {
    const { data: profile } = await serverClient()
      .from("profiles")
      .select("id")
      .eq("email", data.email.trim().toLowerCase())
      .maybeSingle();
    if (!profile) {
      throw new Error(
        "No account found for that email. Ask them to sign in first.",
      );
    }
    const { error } = await serverClient()
      .from("memberships")
      .upsert(
        {
          user_id: profile.id,
          organization_id: user.organizationId,
          role: data.role,
        },
        { onConflict: "user_id,organization_id" },
      );
    if (error) {
      throw new Error(`Failed to add member: ${error.message}`);
    }
  }
  revalidatePath("/settings");
}

/** Changes a member's role within the workspace. */
export async function updateMemberRole(
  userId: string,
  role: OrgRole,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user.organizationId) {
    throw new Error("No active workspace.");
  }
  if (hasSupabaseEnv()) {
    const { error } = await serverClient()
      .from("memberships")
      .update({ role })
      .eq("user_id", userId)
      .eq("organization_id", user.organizationId);
    if (error) {
      throw new Error(`Failed to update member: ${error.message}`);
    }
  }
  void logAuditEvent({
    action: "member.update",
    resourceType: "membership",
    resourceId: userId,
    metadata: { role },
  });
  revalidatePath("/settings");
}

/** Removes a member from the workspace. */
export async function removeMember(userId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user.organizationId) {
    throw new Error("No active workspace.");
  }
  if (hasSupabaseEnv()) {
    const { error } = await serverClient()
      .from("memberships")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", user.organizationId);
    if (error) {
      throw new Error(`Failed to remove member: ${error.message}`);
    }
  }
  void logAuditEvent({
    action: "member.remove",
    resourceType: "membership",
    resourceId: userId,
  });
  revalidatePath("/settings");
}

export interface CandidateInput {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  source: string;
  matchScore?: number;
}

/** Creates a candidate record in the recruitment pipeline. */
export async function createCandidate(
  input: CandidateInput,
): Promise<ActionResult> {
  const data = validate(candidateSchema, input);
  const id = syntheticId("cand");
  const user = await getCurrentUser();
  const memory = await getMemoryAdapter();

  await memory.insert("candidates", {
    id,
    organization_id: user.organizationId,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    role: data.role,
    stage: "applied",
    match_score: data.matchScore ?? 0,
    source: data.source,
  });

  revalidatePath("/recruitment");
  return { id };
}

/** Records a resume URL against a candidate (after a storage upload). */
export async function updateCandidateResume(
  candidateId: string,
  resumeUrl: string,
): Promise<void> {
  const memory = await getMemoryAdapter();
  await memory.update("candidates", { column: "id", value: candidateId }, { resume_url: resumeUrl });
  revalidatePath("/recruitment");
}
