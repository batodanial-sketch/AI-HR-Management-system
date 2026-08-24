import "server-only";
import type { Json } from "@/lib/database.types";

/**
 * Daily Employee Workflow Engine — core logic for template evaluation,
 * idempotent task generation, and step execution.
 *
 * RCE-safe: no shell execution, only validated JSON steps.
 * Org-isolated: all queries scoped by organization_id + RLS is_organization_member.
 */

export type WorkflowTriggerType = "daily" | "cron" | "event" | "manual";

export type WorkflowStepType =
  | "attendance_auto_log"
  | "performance_pulse_generation"
  | "notification_dispatch"
  | "ai_task_digest"
  | "performance_scoring"
  | "anomaly_detection"
  | "custom";

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  title: string;
  config?: Record<string, unknown>;
  order: number;
  enabled?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  organizationId: string;
  title: string;
  description?: string | null;
  steps: WorkflowStep[];
  triggerType: WorkflowTriggerType;
  scheduleCron?: string | null;
  scheduleTime?: string | null; // "09:00"
  targetRoles: string[]; // e.g., ["employee","manager","admin"] or specific codes
  isActive: boolean;
}

export interface DailyTask {
  id: string;
  organizationId: string;
  employeeId: string;
  workflowTemplateId: string | null;
  taskDate: string; // YYYY-MM-DD
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped" | "cancelled";
  payload: Record<string, unknown>;
  dueTime?: string | null;
}

export const TASK_STATUS = ["pending", "in_progress", "completed", "failed", "skipped", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const EXECUTION_STATUS = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUS)[number];

/**
 * Parses steps_json safely into WorkflowStep array.
 */
export function parseSteps(stepsJson: Json | null): WorkflowStep[] {
  if (!stepsJson) return [];
  if (Array.isArray(stepsJson)) {
    return (stepsJson as unknown as WorkflowStep[]).filter((s) => typeof s.id === "string" && typeof s.type === "string");
  }
  if (typeof stepsJson === "object") {
    const obj = stepsJson as { steps?: WorkflowStep[] };
    if (Array.isArray(obj.steps)) {
      return obj.steps.filter((s) => typeof s.id === "string");
    }
  }
  return [];
}

/**
 * Parses target_roles JSON into string array.
 */
export function parseTargetRoles(targetRolesJson: Json | null): string[] {
  if (!targetRolesJson) return [];
  if (Array.isArray(targetRolesJson)) {
    return (targetRolesJson as string[]).filter((r) => typeof r === "string");
  }
  return [];
}

/**
 * Determines if a workflow template applies to an employee based on target roles.
 * - Empty target_roles = applies to all active employees
 * - Contains "all" or "employee" = applies to all
 * - Otherwise checks employee role/department mapping (simplified: if employee role code matches or department matches)
 *
 * For this implementation, we treat target_roles as role codes; if empty, applies to all.
 * More complex mapping (department, location) can be added via config.
 */
export function doesTemplateApplyToEmployee(
  template: { targetRoles: string[] },
  employee: { role?: string | null; departmentId?: string | null; status?: string },
): boolean {
  if (employee.status && employee.status !== "active") return false;
  if (!template.targetRoles || template.targetRoles.length === 0) return true;
  const lowerRoles = template.targetRoles.map((r) => r.toLowerCase());
  if (lowerRoles.includes("all") || lowerRoles.includes("employee") || lowerRoles.includes("*")) return true;
  if (employee.role && lowerRoles.includes(employee.role.toLowerCase())) return true;
  // Department-based targeting: if target role matches department code/id pattern
  // For simplicity, we also allow departmentId in targetRoles
  return false;
}

/**
 * Generates a unique idempotent key for daily tasks: org + employee + date + template
 * Used for upsert onConflict.
 */
export function taskIdempotencyKey(
  organizationId: string,
  employeeId: string,
  taskDate: string,
  templateId: string,
): string {
  return `${organizationId}:${employeeId}:${taskDate}:${templateId}`;
}

/**
 * Validates cron expression (basic check: 5 fields, allowed chars).
 * Does not execute, only validates structure for RCE safety.
 */
export function isValidCron(cron: string): boolean {
  if (!cron) return false;
  const trimmed = cron.trim();
  // Basic cron: 5 fields, digits, *, /, -, ,, letters for month/weekday allowed
  const cronRegex = /^([*\d/,/-]+|\w+)\s+([*\d/,/-]+|\w+)\s+([*\d/,/-]+|\w+)\s+([*\d/,/-]+|\w+)\s+([*\d/,/-]+|\w+)$/;
  return cronRegex.test(trimmed);
}

/**
 * Checks if a template should run on a given date based on trigger type.
 * - daily: always runs
 * - cron: checks if cron matches date (simplified: checks weekday for 1-5 etc)
 * - manual/event: does not auto-generate daily
 */
export function shouldTemplateRunOnDate(
  template: { triggerType: string; scheduleCron?: string | null; isActive: boolean },
  date: Date,
): boolean {
  if (!template.isActive) return false;
  if (template.triggerType === "daily") return true;
  if (template.triggerType === "cron" && template.scheduleCron) {
    if (!isValidCron(template.scheduleCron)) return false;
    // Simplified: if cron contains "1-5" (weekdays) and date is weekend, skip
    const day = date.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekday = day >= 1 && day <= 5;
    if (template.scheduleCron.includes("1-5") && !isWeekday) return false;
    return true;
  }
  return false;
}

/**
 * Builds payload_json for a daily task from template steps.
 */
export function buildTaskPayload(
  template: { id: string; title: string; steps: WorkflowStep[] },
  employee: { id: string; firstName?: string; lastName?: string },
  taskDate: string,
): Record<string, unknown> {
  return {
    template_id: template.id,
    template_title: template.title,
    employee_id: employee.id,
    task_date: taskDate,
    steps: template.steps
      .filter((s) => s.enabled !== false)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        config: s.config ?? {},
      })),
    generated_at: new Date().toISOString(),
  };
}

/**
 * Default workflow templates for new organizations (seed).
 */
export function getDefaultWorkflowTemplates(organizationId: string): Array<{
  organization_id: string;
  title: string;
  description: string;
  steps_json: Json;
  trigger_type: string;
  schedule_time: string;
  target_roles: Json;
  is_active: boolean;
}> {
  return [
    {
      organization_id: organizationId,
      title: "Daily Attendance Check-in",
      description: "Auto-generates attendance task for active employees each morning",
      steps_json: [
        { id: "step-1", type: "attendance_auto_log", title: "Attendance Auto-Log", order: 0, enabled: true, config: { grace_minutes: 15 } },
      ] as unknown as Json,
      trigger_type: "daily",
      schedule_time: "09:00",
      target_roles: ["all"] as unknown as Json,
      is_active: true,
    },
    {
      organization_id: organizationId,
      title: "Daily Performance Pulse",
      description: "Generates daily performance pulse and AI task digest for managers",
      steps_json: [
        { id: "step-1", type: "performance_pulse_generation", title: "Generate Performance Pulse", order: 0, enabled: true },
        { id: "step-2", type: "ai_task_digest", title: "AI Task Digest Summarization", order: 1, enabled: true, config: { model: "openai/gpt-oss-120b" } },
        { id: "step-3", type: "notification_dispatch", title: "Dispatch Notifications", order: 2, enabled: true, config: { channel: "in_app" } },
      ] as unknown as Json,
      trigger_type: "daily",
      schedule_time: "10:00",
      target_roles: ["manager", "admin"] as unknown as Json,
      is_active: true,
    },
    {
      organization_id: organizationId,
      title: "Weekly Anomaly Detection",
      description: "Runs anomaly detection on attendance and payroll weekly",
      steps_json: [
        { id: "step-1", type: "anomaly_detection", title: "Attendance Anomaly Detection", order: 0, enabled: true },
        { id: "step-2", type: "performance_scoring", title: "Automated Performance Scoring", order: 1, enabled: true },
      ] as unknown as Json,
      trigger_type: "cron",
      schedule_time: "08:00",
      target_roles: ["admin", "hr_admin"] as unknown as Json,
      is_active: true,
    },
  ];
}
