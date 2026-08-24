"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, type WorkflowRow, type WorkflowRunRow } from "@/src/lib/supabase";
import type { Database, Json } from "@/lib/database.types";
import type { ActionResponse } from "./types";
import { actionFailure, actionSuccess } from "./types";
import { requireOrganizationContext, revalidateWorkspacePaths, uuidSchema, validationFailure } from "./_shared";
import { toJson } from "@/lib/utils";
import { enqueuePythonJob } from "@/src/lib/pythonBridge";
import {
  parseSteps,
  parseTargetRoles,
  doesTemplateApplyToEmployee,
  shouldTemplateRunOnDate,
  buildTaskPayload,
  TASK_STATUS,
  type WorkflowStep,
} from "@/lib/workflow-engine";

/**
 * Daily Employee Workflow Engine & Automation Backend
 * High-throughput, org-isolated, RLS-enforced, idempotent daily task generation.
 *
 * Tables:
 * - workflow_templates (org PK, title, steps_json, trigger_type, schedule, target_roles, is_active)
 * - daily_employee_tasks (org, employee, date, status, payload_json, due_time) — unique org+employee+date+template
 * - workflow_executions (org, workflow_id, template_id, task_id, status, error_log, audit)
 *
 * All actions typed with SupabaseClient<Database> and Zod guards.
 */

type TypedClient = SupabaseClient<Database>;

const jsonRecord = z.record(z.string(), z.unknown());

// ── Existing workflow schemas (legacy) ─────────────────────────────────────

const createWorkflowSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(4000).optional().nullable(),
  triggerType: z.string().min(2).max(120),
  triggerConfig: jsonRecord.default({}),
  actions: z.array(jsonRecord).min(1).max(50),
  status: z.enum(["active", "paused", "archived"]).default("active"),
});

const updateWorkflowStatusSchema = z.object({
  workflowId: uuidSchema,
  status: z.enum(["active", "paused", "archived"]),
});

const runWorkflowSchema = z.object({
  workflowId: uuidSchema,
  triggerPayload: jsonRecord.default({}),
});

export type WorkflowOverview = {
  workflows: WorkflowRow[];
  runs: WorkflowRunRow[];
};

// ── New daily workflow schemas ─────────────────────────────────────────────

const generateDailyWorkflowsSchema = z.object({
  taskDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "taskDate must be YYYY-MM-DD")
    .optional(),
  organizationId: uuidSchema.optional(), // For cron: explicit org, otherwise current user's org
});

const updateTaskStatusSchema = z.object({
  taskId: uuidSchema,
  status: z.enum(TASK_STATUS),
  payload: jsonRecord.optional(),
});

const executeWorkflowStepSchema = z.object({
  taskId: uuidSchema,
  stepId: z.string().trim().min(1).max(100),
  stepType: z.enum([
    "attendance_auto_log",
    "performance_pulse_generation",
    "notification_dispatch",
    "ai_task_digest",
    "performance_scoring",
    "anomaly_detection",
    "custom",
  ]),
  config: jsonRecord.optional(),
});

export interface DailyTaskView {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName?: string | null;
  workflowTemplateId: string | null;
  templateTitle?: string | null;
  taskDate: string;
  status: string;
  payload: Record<string, unknown>;
  dueTime: string | null;
  createdAt: string;
}

export interface GenerateDailyResult {
  organizationId: string;
  taskDate: string;
  templatesEvaluated: number;
  employeesScanned: number;
  tasksGenerated: number;
  tasksSkipped: number;
}

// ── Legacy actions (preserved) ─────────────────────────────────────────────

export async function getWorkflowOverviewAction(): Promise<ActionResponse<WorkflowOverview>> {
  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = await createServerSupabaseClient();
    const [workflowsResult, runsResult] = await Promise.all([
      supabase.from("workflows").select("*").eq("organization_id", auth.data.organizationId).order("updated_at", { ascending: false }),
      supabase.from("workflow_runs").select("*").eq("organization_id", auth.data.organizationId).order("created_at", { ascending: false }).limit(200),
    ]);
    const error = workflowsResult.error || runsResult.error;
    if (error) return actionFailure(error.message);
    return actionSuccess({
      workflows: (workflowsResult.data || []) as WorkflowRow[],
      runs: (runsResult.data || []) as WorkflowRunRow[],
    });
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : "Unable to load automation records.");
  }
}

export async function createWorkflowAction(input: z.input<typeof createWorkflowSchema>): Promise<ActionResponse<WorkflowRow>> {
  const parsed = createWorkflowSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("workflows")
      .insert({
        organization_id: auth.data.organizationId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        trigger_type: parsed.data.triggerType,
        trigger_config: toJson(parsed.data.triggerConfig),
        actions: toJson(parsed.data.actions),
        status: parsed.data.status,
        created_by: auth.data.userId,
      })
      .select()
      .single();
    if (error || !data) return actionFailure(error?.message || "Workflow creation returned no record.");
    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: "create",
      entity_type: "workflow",
      entity_id: data.id,
      before_state: null,
      after_state: {
        name: parsed.data.name,
        trigger_type: parsed.data.triggerType,
        action_count: parsed.data.actions.length,
        status: parsed.data.status,
      },
    });
    revalidateWorkspacePaths("/", "/dashboard");
    return actionSuccess(data as WorkflowRow);
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : "Unable to create workflow.");
  }
}

export async function updateWorkflowStatusAction(input: z.input<typeof updateWorkflowStatusSchema>): Promise<ActionResponse<WorkflowRow>> {
  const parsed = updateWorkflowStatusSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: workflow, error: lookupError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", parsed.data.workflowId)
      .eq("organization_id", auth.data.organizationId)
      .maybeSingle();
    if (lookupError || !workflow) return actionFailure(lookupError?.message || "Workflow was not found.");
    const { data, error } = await supabase
      .from("workflows")
      .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
      .eq("id", workflow.id)
      .select()
      .single();
    if (error || !data) return actionFailure(error?.message || "Workflow status update returned no record.");
    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: "update",
      entity_type: "workflow",
      entity_id: workflow.id,
      before_state: { status: workflow.status },
      after_state: { status: parsed.data.status },
    });
    revalidateWorkspacePaths("/", "/dashboard");
    return actionSuccess(data as WorkflowRow);
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : "Unable to update workflow status.");
  }
}

export async function runWorkflowAction(input: z.input<typeof runWorkflowSchema>): Promise<ActionResponse<WorkflowRunRow>> {
  const parsed = runWorkflowSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", parsed.data.workflowId)
      .eq("organization_id", auth.data.organizationId)
      .maybeSingle();
    if (workflowError || !workflow) return actionFailure(workflowError?.message || "Workflow was not found.");
    if (workflow.status !== "active") return actionFailure("Only active workflows can be run.");

    const job = await enqueuePythonJob("workflow", {
      organizationId: auth.data.organizationId,
      requestedBy: auth.data.userId,
      payload: {
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        actions: Array.isArray(workflow.actions) ? workflow.actions : [],
        trigger_payload: toJson(parsed.data.triggerPayload),
      },
    });
    if (!job.success) return actionFailure(job.error);

    const { data: run, error: runError } = await supabase
      .from("workflow_runs")
      .insert({
        organization_id: auth.data.organizationId,
        workflow_id: workflow.id,
        status: "queued",
        trigger_payload: toJson(parsed.data.triggerPayload),
        output: toJson({ python_job_id: job.data.id }),
        error_message: null,
        started_at: null,
        finished_at: null,
      })
      .select()
      .single();
    if (runError || !run) return actionFailure(runError?.message || "Python job queued but workflow run persistence failed.");

    await supabase
      .from("workflows")
      .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", workflow.id)
      .eq("organization_id", auth.data.organizationId);
    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_user_id: auth.data.userId,
      action: "generate",
      entity_type: "workflow_run",
      entity_id: run.id,
      before_state: null,
      after_state: { workflow_id: workflow.id, python_job_id: job.data.id, status: "queued" },
    });
    revalidateWorkspacePaths("/", "/dashboard");
    return actionSuccess(run as WorkflowRunRow);
  } catch (error) {
    return actionFailure(error instanceof Error ? error.message : "Unable to run workflow.");
  }
}

// ── New daily workflow engine actions ──────────────────────────────────────

/**
 * Generates daily tasks for all active employees based on active workflow templates.
 * Idempotent: uses upsert on (organization_id, employee_id, task_date, workflow_template_id).
 * Scans employees where deleted_at IS NULL and status = active (or no status filter for demo).
 */
export async function generateDailyWorkflowsAction(
  input: z.input<typeof generateDailyWorkflowsSchema> = {},
): Promise<ActionResponse<GenerateDailyResult>> {
  const parsed = generateDailyWorkflowsSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const auth = await requireOrganizationContext("admin");
  if (!auth.success) {
    return auth;
  }

  const organizationId = parsed.data.organizationId ?? auth.data.organizationId;
  const taskDate = parsed.data.taskDate ?? new Date().toISOString().slice(0, 10);
  const dateObj = new Date(`${taskDate}T00:00:00Z`);

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    // Fetch active workflow templates for org
    const { data: templates, error: templatesError } = await supabase
      .from("workflow_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (templatesError) {
      return actionFailure(templatesError.message);
    }

    // Filter templates that should run on this date
    const runnableTemplates = (templates ?? []).filter((t) =>
      shouldTemplateRunOnDate(
        {
          triggerType: t.trigger_type ?? "daily",
          scheduleCron: t.schedule_cron ?? null,
          isActive: t.is_active ?? true,
        },
        dateObj,
      ),
    );

    // Fetch active employees for org
    const { data: employees, error: employeesError } = await supabase
      .from("employees")
      .select("id, first_name, last_name, department_id, status, work_email")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    if (employeesError) {
      return actionFailure(employeesError.message);
    }

    const activeEmployees = (employees ?? []).filter((e) => {
      const status = (e as { status?: string }).status;
      return !status || status === "active";
    });

    let tasksGenerated = 0;
    let tasksSkipped = 0;

    // For each template + employee, evaluate target roles and upsert task
    for (const template of runnableTemplates) {
      const steps = parseSteps(template.steps_json as Json);
      const targetRoles = parseTargetRoles(template.target_roles as Json);

      for (const employee of activeEmployees) {
        const applies = doesTemplateApplyToEmployee(
          { targetRoles },
          {
            role: null, // role resolution would require membership join; simplified to all
            departmentId: (employee as { department_id?: string }).department_id ?? null,
            status: (employee as { status?: string }).status ?? "active",
          },
        );

        if (!applies) {
          tasksSkipped++;
          continue;
        }

        const payload = buildTaskPayload(
          {
            id: template.id,
            title: template.title,
            steps,
          },
          {
            id: employee.id,
            firstName: (employee as { first_name?: string }).first_name ?? "",
            lastName: (employee as { last_name?: string }).last_name ?? "",
          },
          taskDate,
        );

        const { error: upsertError } = await supabase
          .from("daily_employee_tasks")
          .upsert(
            {
              organization_id: organizationId,
              employee_id: employee.id,
              workflow_template_id: template.id,
              task_date: taskDate,
              status: "pending",
              payload_json: payload as unknown as Json,
              due_time: template.schedule_time ?? null,
            } as Database["public"]["Tables"]["daily_employee_tasks"]["Insert"],
            {
              onConflict: "organization_id,employee_id,task_date,workflow_template_id",
            },
          );

        if (upsertError) {
          // Log but continue — don't fail entire batch on single error
          console.error(`[workflow] upsert failed for employee ${employee.id}: ${upsertError.message}`);
          tasksSkipped++;
        } else {
          tasksGenerated++;
        }
      }
    }

    // Log execution to workflow_executions
    await supabase.from("workflow_executions").insert({
      organization_id: organizationId,
      workflow_template_id: null,
      status: "succeeded",
      execution_payload: {
        action: "generateDailyWorkflows",
        task_date: taskDate,
        templates: runnableTemplates.length,
        employees: activeEmployees.length,
        tasks_generated: tasksGenerated,
      } as unknown as Json,
      result_json: {
        tasksGenerated,
        tasksSkipped,
      } as unknown as Json,
      triggered_by: "system",
    } as Database["public"]["Tables"]["workflow_executions"]["Insert"]);

    // Audit log
    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: auth.data.userId,
      action: "generate",
      entity_type: "daily_employee_tasks",
      metadata: {
        action: "workflow.daily.generate",
        task_date: taskDate,
        templates_evaluated: runnableTemplates.length,
        employees_scanned: activeEmployees.length,
        tasks_generated: tasksGenerated,
      } as unknown as Json,
    } as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return actionSuccess({
      organizationId,
      taskDate,
      templatesEvaluated: runnableTemplates.length,
      employeesScanned: activeEmployees.length,
      tasksGenerated,
      tasksSkipped,
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to generate daily workflows.",
    );
  }
}

/**
 * Updates daily task status (check-in, completion, etc.) with strict org context.
 */
export async function updateTaskStatusAction(
  input: z.input<typeof updateTaskStatusSchema>,
): Promise<ActionResponse<DailyTaskView>> {
  const parsed = updateTaskStatusSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const auth = await requireOrganizationContext("employee");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    const { data: existing, error: fetchError } = await supabase
      .from("daily_employee_tasks")
      .select("*")
      .eq("id", parsed.data.taskId)
      .eq("organization_id", auth.data.organizationId)
      .maybeSingle();

    if (fetchError || !existing) {
      return actionFailure(fetchError?.message ?? "Task not found or not in your organization.");
    }

    const updates: Database["public"]["Tables"]["daily_employee_tasks"]["Update"] = {
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.status === "completed") {
      updates.completed_at = new Date().toISOString();
    }

    if (parsed.data.payload) {
      // Merge payloads
      const currentPayload = (existing.payload_json as Record<string, unknown>) ?? {};
      updates.payload_json = {
        ...currentPayload,
        ...parsed.data.payload,
        last_status_update: new Date().toISOString(),
      } as unknown as Json;
    }

    const { data, error } = await supabase
      .from("daily_employee_tasks")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error || !data) {
      return actionFailure(error?.message ?? "Failed to update task status.");
    }

    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_id: auth.data.userId,
      action: "update",
      entity_type: "daily_employee_tasks",
      entity_id: data.id,
      before_state: { status: existing.status } as unknown as Json,
      after_state: { status: data.status } as unknown as Json,
      metadata: { action: "workflow.task.status.update" } as unknown as Json,
    } as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return actionSuccess({
      id: data.id,
      organizationId: data.organization_id,
      employeeId: data.employee_id,
      workflowTemplateId: data.workflow_template_id,
      taskDate: data.task_date,
      status: data.status,
      payload: (data.payload_json as Record<string, unknown>) ?? {},
      dueTime: data.due_time,
      createdAt: data.created_at,
    });
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to update task status.",
    );
  }
}

/**
 * Executes a workflow step for a daily task.
 * Handles automated steps: attendance auto-log, performance pulse, notification dispatch,
 * and delegates heavy AI tasks to Python bridge via enqueuePythonJob.
 */
export async function executeWorkflowStepAction(
  input: z.input<typeof executeWorkflowStepSchema>,
): Promise<ActionResponse<{ executionId: string; status: string }>> {
  const parsed = executeWorkflowStepSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const auth = await requireOrganizationContext("employee");
  if (!auth.success) {
    return auth;
  }

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    const { data: task, error: taskError } = await supabase
      .from("daily_employee_tasks")
      .select("*")
      .eq("id", parsed.data.taskId)
      .eq("organization_id", auth.data.organizationId)
      .maybeSingle();

    if (taskError || !task) {
      return actionFailure(taskError?.message ?? "Task not found.");
    }

    const start = Date.now();

    // Create execution log entry (queued)
    const { data: execution, error: execError } = await supabase
      .from("workflow_executions")
      .insert({
        organization_id: auth.data.organizationId,
        workflow_template_id: task.workflow_template_id,
        task_id: task.id,
        status: "running",
        execution_payload: {
          task_id: task.id,
          step_id: parsed.data.stepId,
          step_type: parsed.data.stepType,
          config: parsed.data.config ?? {},
        } as unknown as Json,
        triggered_by: "user",
      } as Database["public"]["Tables"]["workflow_executions"]["Insert"])
      .select("*")
      .single();

    if (execError || !execution) {
      return actionFailure(execError?.message ?? "Failed to create execution log.");
    }

    try {
      // Handle step types
      switch (parsed.data.stepType) {
        case "attendance_auto_log": {
          // Create attendance record for today if not exists
          const { data: employee } = await supabase
            .from("employees")
            .select("id")
            .eq("id", task.employee_id)
            .eq("organization_id", auth.data.organizationId)
            .maybeSingle();

          if (employee) {
            await supabase.from("attendance_records").upsert(
              {
                organization_id: auth.data.organizationId,
                employee_id: task.employee_id,
                work_date: task.task_date,
                status: "present",
                check_in_at: new Date().toISOString(),
                worked_minutes: 0,
                source: "workflow_auto_log",
              } as never,
              { onConflict: "employee_id,work_date" },
            );
          }
          break;
        }
        case "notification_dispatch": {
          const title = (parsed.data.config?.title as string) ?? "Workflow Task";
          const body = (parsed.data.config?.body as string) ?? `Task ${task.id} requires attention.`;
          await supabase.from("notifications").insert({
            organization_id: auth.data.organizationId,
            user_id: auth.data.userId,
            title,
            description: body,
            kind: "info",
          } as never);
          break;
        }
        case "performance_pulse_generation": {
          // Enqueue to Python bridge for heavy processing
          await enqueuePythonJob("workflow", {
            organizationId: auth.data.organizationId,
            payload: {
              type: "performance_pulse",
              taskId: task.id,
              employeeId: task.employee_id,
              config: parsed.data.config ?? {},
            },
          });
          break;
        }
        case "ai_task_digest":
        case "performance_scoring":
        case "anomaly_detection": {
          // Delegate to Python bridge batch processor
          await enqueuePythonJob("workflow", {
            organizationId: auth.data.organizationId,
            payload: {
              type: "workflow_batch",
              taskId: task.id,
              stepType: parsed.data.stepType,
              config: parsed.data.config ?? {},
            },
          });
          break;
        }
        case "custom": {
          // Custom step — no-op, just log
          break;
        }
      }

      const duration = Date.now() - start;

      // Update execution as succeeded
      await supabase
        .from("workflow_executions")
        .update({
          status: "succeeded",
          result_json: { step_id: parsed.data.stepId, step_type: parsed.data.stepType, status: "completed" } as unknown as Json,
          duration_ms: duration,
        } as Database["public"]["Tables"]["workflow_executions"]["Update"])
        .eq("id", execution.id);

      // Optionally mark task as in_progress if it was pending
      if (task.status === "pending") {
        await supabase
          .from("daily_employee_tasks")
          .update({ status: "in_progress", updated_at: new Date().toISOString() } as Database["public"]["Tables"]["daily_employee_tasks"]["Update"])
          .eq("id", task.id);
      }

      return actionSuccess({ executionId: execution.id, status: "succeeded" });
    } catch (stepErr) {
      const duration = Date.now() - start;
      const errorMsg = stepErr instanceof Error ? stepErr.message : "Step execution failed.";

      await supabase
        .from("workflow_executions")
        .update({
          status: "failed",
          error_log: errorMsg,
          duration_ms: duration,
        } as Database["public"]["Tables"]["workflow_executions"]["Update"])
        .eq("id", execution.id);

      return actionFailure(`Step execution failed: ${errorMsg}`);
    }
  } catch (err) {
    return actionFailure(
      err instanceof Error ? err.message : "Unable to execute workflow step.",
    );
  }
}

/**
 * Lists daily tasks for current org (employee can see own, admin can see all).
 */
export async function listDailyTasksAction(input: { taskDate?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<
  ActionResponse<{ rows: DailyTaskView[]; total: number }>
> {
  const schema = z.object({
    taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(TASK_STATUS).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(200).default(25),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const auth = await requireOrganizationContext("employee");
  if (!auth.success) return auth;

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;
    let query = supabase
      .from("daily_employee_tasks")
      .select("*", { count: "exact" })
      .eq("organization_id", auth.data.organizationId)
      .order("task_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (parsed.data.taskDate) {
      query = query.eq("task_date", parsed.data.taskDate);
    }
    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }

    const from = (parsed.data.page - 1) * parsed.data.pageSize;
    const to = from + parsed.data.pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) return actionFailure(error.message);

    const rows: DailyTaskView[] = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      employeeId: row.employee_id,
      workflowTemplateId: row.workflow_template_id,
      taskDate: row.task_date,
      status: row.status,
      payload: (row.payload_json as Record<string, unknown>) ?? {},
      dueTime: row.due_time,
      createdAt: row.created_at,
    }));

    return actionSuccess({ rows, total: count ?? rows.length });
  } catch (err) {
    return actionFailure(err instanceof Error ? err.message : "Unable to list daily tasks.");
  }
}

// ── Workflow Templates CRUD (Admin) ────────────────────────────────────────

export interface WorkflowTemplateView {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  steps: WorkflowStep[];
  triggerType: string;
  scheduleCron: string | null;
  scheduleTime: string | null;
  targetRoles: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const workflowTemplateCreateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional().nullable(),
  steps: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(100),
        type: z.enum([
          "attendance_auto_log",
          "performance_pulse_generation",
          "notification_dispatch",
          "ai_task_digest",
          "performance_scoring",
          "anomaly_detection",
          "custom",
        ]),
        title: z.string().trim().min(1).max(200),
        order: z.number().int().min(0).max(100),
        enabled: z.boolean().optional(),
        config: jsonRecord.optional(),
      }),
    )
    .min(1)
    .max(20),
  triggerType: z.enum(["daily", "cron", "event", "manual"]).default("daily"),
  scheduleCron: z.string().trim().max(100).optional().nullable(),
  scheduleTime: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be HH:MM").optional().nullable(),
  targetRoles: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  isActive: z.boolean().default(true),
});

const workflowTemplateUpdateSchema = workflowTemplateCreateSchema.partial().extend({
  templateId: uuidSchema,
});

const workflowTemplateToggleSchema = z.object({
  templateId: uuidSchema,
  isActive: z.boolean(),
});

const workflowTemplateDeleteSchema = z.object({
  templateId: uuidSchema,
});

function mapTemplateRow(row: Database["public"]["Tables"]["workflow_templates"]["Row"]): WorkflowTemplateView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    steps: parseSteps(row.steps_json as Json),
    triggerType: row.trigger_type,
    scheduleCron: row.schedule_cron,
    scheduleTime: row.schedule_time,
    targetRoles: parseTargetRoles(row.target_roles as Json),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWorkflowTemplatesAction(): Promise<ActionResponse<WorkflowTemplateView[]>> {
  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;
    const { data, error } = await supabase
      .from("workflow_templates")
      .select("*")
      .eq("organization_id", auth.data.organizationId)
      .order("created_at", { ascending: false });

    if (error) return actionFailure(error.message);

    const rows = (data ?? []).map((r) => mapTemplateRow(r as Database["public"]["Tables"]["workflow_templates"]["Row"]));
    return actionSuccess(rows);
  } catch (err) {
    return actionFailure(err instanceof Error ? err.message : "Unable to list workflow templates.");
  }
}

export async function createWorkflowTemplateAction(
  input: z.input<typeof workflowTemplateCreateSchema>,
): Promise<ActionResponse<WorkflowTemplateView>> {
  const parsed = workflowTemplateCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    if (parsed.data.scheduleCron && parsed.data.triggerType === "cron") {
      // Basic cron validation (RCE-safe)
      const cron = parsed.data.scheduleCron.trim();
      if (cron && !/^([*\d/,/-]+|\w+)\s+([*\d/,/-]+|\w+)\s+([*\d/,/-]+|\w+)\s+([*\d/,/-]+|\w+)\s+([*\d/,/-]+|\w+)$/.test(cron)) {
        return actionFailure("Invalid cron expression (expected 5 fields).");
      }
    }

    const { data, error } = await supabase
      .from("workflow_templates")
      .insert({
        organization_id: auth.data.organizationId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        steps_json: parsed.data.steps as unknown as Json,
        trigger_type: parsed.data.triggerType,
        schedule_cron: parsed.data.scheduleCron ?? null,
        schedule_time: parsed.data.scheduleTime ?? null,
        target_roles: parsed.data.targetRoles as unknown as Json,
        is_active: parsed.data.isActive,
        created_by: auth.data.userId,
      } as Database["public"]["Tables"]["workflow_templates"]["Insert"])
      .select("*")
      .single();

    if (error || !data) return actionFailure(error?.message ?? "Failed to create template.");

    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_id: auth.data.userId,
      action: "create",
      entity_type: "workflow_template",
      entity_id: data.id,
      metadata: { action: "workflow_template.create", title: parsed.data.title } as unknown as Json,
    } as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return actionSuccess(mapTemplateRow(data as Database["public"]["Tables"]["workflow_templates"]["Row"]));
  } catch (err) {
    return actionFailure(err instanceof Error ? err.message : "Unable to create workflow template.");
  }
}

export async function updateWorkflowTemplateAction(
  input: z.input<typeof workflowTemplateUpdateSchema>,
): Promise<ActionResponse<WorkflowTemplateView>> {
  const parsed = workflowTemplateUpdateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    const { data: existing, error: fetchError } = await supabase
      .from("workflow_templates")
      .select("*")
      .eq("id", parsed.data.templateId)
      .eq("organization_id", auth.data.organizationId)
      .maybeSingle();

    if (fetchError || !existing) return actionFailure(fetchError?.message ?? "Template not found.");

    const updates: Database["public"]["Tables"]["workflow_templates"]["Update"] = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
    if (parsed.data.steps !== undefined) updates.steps_json = parsed.data.steps as unknown as Json;
    if (parsed.data.triggerType !== undefined) updates.trigger_type = parsed.data.triggerType;
    if (parsed.data.scheduleCron !== undefined) updates.schedule_cron = parsed.data.scheduleCron ?? null;
    if (parsed.data.scheduleTime !== undefined) updates.schedule_time = parsed.data.scheduleTime ?? null;
    if (parsed.data.targetRoles !== undefined) updates.target_roles = parsed.data.targetRoles as unknown as Json;
    if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive;

    const { data, error } = await supabase
      .from("workflow_templates")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error || !data) return actionFailure(error?.message ?? "Failed to update template.");

    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_id: auth.data.userId,
      action: "update",
      entity_type: "workflow_template",
      entity_id: data.id,
      metadata: { action: "workflow_template.update" } as unknown as Json,
    } as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return actionSuccess(mapTemplateRow(data as Database["public"]["Tables"]["workflow_templates"]["Row"]));
  } catch (err) {
    return actionFailure(err instanceof Error ? err.message : "Unable to update workflow template.");
  }
}

export async function toggleWorkflowTemplateAction(
  input: z.input<typeof workflowTemplateToggleSchema>,
): Promise<ActionResponse<WorkflowTemplateView>> {
  return updateWorkflowTemplateAction({ templateId: input.templateId, isActive: input.isActive });
}

export async function deleteWorkflowTemplateAction(
  input: z.input<typeof workflowTemplateDeleteSchema>,
): Promise<ActionResponse<{ id: string }>> {
  const parsed = workflowTemplateDeleteSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    const { error } = await supabase
      .from("workflow_templates")
      .delete()
      .eq("id", parsed.data.templateId)
      .eq("organization_id", auth.data.organizationId);

    if (error) return actionFailure(error.message);

    await supabase.from("audit_logs").insert({
      organization_id: auth.data.organizationId,
      actor_id: auth.data.userId,
      action: "delete",
      entity_type: "workflow_template",
      entity_id: parsed.data.templateId,
      metadata: { action: "workflow_template.delete" } as unknown as Json,
    } as Database["public"]["Tables"]["audit_logs"]["Insert"]);

    return actionSuccess({ id: parsed.data.templateId });
  } catch (err) {
    return actionFailure(err instanceof Error ? err.message : "Unable to delete workflow template.");
  }
}

// ── Workflow Executions Telemetry ──────────────────────────────────────────

export interface WorkflowExecutionView {
  id: string;
  organizationId: string;
  workflowId: string | null;
  workflowTemplateId: string | null;
  taskId: string | null;
  executedAt: string;
  status: string;
  errorLog: string | null;
  executionPayload: Record<string, unknown>;
  resultJson: Record<string, unknown>;
  durationMs: number | null;
  triggeredBy: string;
}

export async function listWorkflowExecutionsAction(input: {
  status?: string;
  templateId?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<ActionResponse<{ rows: WorkflowExecutionView[]; total: number }>> {
  const schema = z.object({
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]).optional(),
    templateId: uuidSchema.optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(200).default(50),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const auth = await requireOrganizationContext("admin");
  if (!auth.success) return auth;

  try {
    const supabase = (await createServerSupabaseClient()) as TypedClient;

    let query = supabase
      .from("workflow_executions")
      .select("*", { count: "exact" })
      .eq("organization_id", auth.data.organizationId)
      .order("executed_at", { ascending: false });

    if (parsed.data.status) {
      query = query.eq("status", parsed.data.status);
    }
    if (parsed.data.templateId) {
      query = query.eq("workflow_template_id", parsed.data.templateId);
    }

    const from = (parsed.data.page - 1) * parsed.data.pageSize;
    const to = from + parsed.data.pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) return actionFailure(error.message);

    const rows: WorkflowExecutionView[] = (data ?? []).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workflowId: row.workflow_id,
      workflowTemplateId: row.workflow_template_id,
      taskId: row.task_id,
      executedAt: row.executed_at,
      status: row.status,
      errorLog: row.error_log,
      executionPayload: (row.execution_payload as Record<string, unknown>) ?? {},
      resultJson: (row.result_json as Record<string, unknown>) ?? {},
      durationMs: row.duration_ms,
      triggeredBy: row.triggered_by,
    }));

    return actionSuccess({ rows, total: count ?? rows.length });
  } catch (err) {
    return actionFailure(err instanceof Error ? err.message : "Unable to list workflow executions.");
  }
}
