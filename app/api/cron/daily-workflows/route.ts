import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hasSupabaseEnv, serverClient, adminClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily Workflows Cron — high-performance background execution route.
 *
 * Generates daily tasks for all active organizations based on active workflow_templates.
 * Idempotent per org+employee+date+template (upsert onConflict).
 *
 * Security:
 * - Fail-closed: Without CRON_SECRET returns 503 (disabled)
 * - Validates via x-cron-secret header using constant-time comparison
 * - Org-isolated RLS via is_organization_member / is_organization_admin
 * - Logs telemetry to audit_logs for observability
 *
 * Trigger: Hosted cron, systemd timer, or K8s CronJob
 *   curl -H "x-cron-secret: $CRON_SECRET" https://your-app/api/cron/daily-workflows
 *
 * Optional query: ?date=YYYY-MM-DD to generate for specific date (default today)
 */

type TypedClient = SupabaseClient<Database>;

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET is not configured. Cron is disabled." },
      { status: 503 },
    );
  }

  const header = request.headers.get("x-cron-secret") ?? "";
  const tokenBuf = Buffer.from(cronSecret);
  const headerBuf = Buffer.from(header);
  const valid = tokenBuf.length === headerBuf.length && timingSafeEqual(tokenBuf, headerBuf);

  if (!valid) {
    return NextResponse.json({ ok: false, message: "Unauthorized: invalid cron secret." }, { status: 401 });
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      { ok: true, message: "Supabase not configured — demo mode, no workflows generated.", date: new Date().toISOString().slice(0, 10), organizations: 0, tasksGenerated: 0 },
    );
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const taskDate = dateParam && isValidDateString(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  try {
    // Use admin client to iterate all organizations (bypasses RLS, but still org-isolated per insert)
    const admin = adminClient() as unknown as TypedClient;

    // Fetch all active organizations (not deleted)
    const { data: orgs, error: orgsError } = await admin
      .from("organizations")
      .select("id, name")
      .is("deleted_at", null)
      .limit(1000);

    if (orgsError) {
      return NextResponse.json({ ok: false, message: orgsError.message }, { status: 500 });
    }

    const organizations = orgs ?? [];
    let totalTasksGenerated = 0;
    let totalEmployeesScanned = 0;
    let totalTemplatesEvaluated = 0;
    const results: Array<{ organizationId: string; tasksGenerated: number; employees: number; templates: number }> = [];

    // For each org, generate daily workflows (high-throughput but sequential to avoid overwhelming DB)
    for (const org of organizations) {
      try {
        const orgResult = await generateForOrganization(admin, org.id, taskDate);
        totalTasksGenerated += orgResult.tasksGenerated;
        totalEmployeesScanned += orgResult.employeesScanned;
        totalTemplatesEvaluated += orgResult.templatesEvaluated;
        results.push({
          organizationId: org.id,
          tasksGenerated: orgResult.tasksGenerated,
          employees: orgResult.employeesScanned,
          templates: orgResult.templatesEvaluated,
        });

        // Telemetry to audit_logs (org-scoped)
        await admin.from("audit_logs").insert({
          organization_id: org.id,
          action: "generate",
          entity_type: "daily_employee_tasks",
          metadata: {
            action: "cron.daily_workflows",
            task_date: taskDate,
            tasks_generated: orgResult.tasksGenerated,
            employees_scanned: orgResult.employeesScanned,
            templates_evaluated: orgResult.templatesEvaluated,
          } as unknown as Json,
        } as Database["public"]["Tables"]["audit_logs"]["Insert"]);
      } catch (err) {
        // Log failure but continue to next org
        console.error(`[cron/daily-workflows] org ${org.id} failed:`, err instanceof Error ? err.message : String(err));
        await admin.from("audit_logs").insert({
          organization_id: org.id,
          action: "generate",
          entity_type: "daily_employee_tasks",
          metadata: {
            action: "cron.daily_workflows.failed",
            task_date: taskDate,
            error: err instanceof Error ? err.message : String(err),
          } as unknown as Json,
        } as Database["public"]["Tables"]["audit_logs"]["Insert"]);
      }
    }

    return NextResponse.json({
      ok: true,
      date: taskDate,
      organizations: organizations.length,
      tasksGenerated: totalTasksGenerated,
      employeesScanned: totalEmployeesScanned,
      templatesEvaluated: totalTemplatesEvaluated,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Cron execution failed." },
      { status: 500 },
    );
  }
}

// POST also supported for cron services that use POST
export async function POST(request: Request): Promise<NextResponse> {
  return GET(request);
}

async function generateForOrganization(
  admin: TypedClient,
  organizationId: string,
  taskDate: string,
): Promise<{ tasksGenerated: number; employeesScanned: number; templatesEvaluated: number }> {
  const dateObj = new Date(`${taskDate}T00:00:00Z`);

  // Fetch active templates
  const { data: templates, error: templatesError } = await admin
    .from("workflow_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (templatesError) throw new Error(templatesError.message);

  const runnableTemplates = (templates ?? []).filter((t) => {
    const triggerType = (t as { trigger_type?: string }).trigger_type ?? "daily";
    const scheduleCron = (t as { schedule_cron?: string | null }).schedule_cron ?? null;
    const isActive = (t as { is_active?: boolean }).is_active ?? true;
    if (!isActive) return false;
    if (triggerType === "daily") return true;
    if (triggerType === "cron" && scheduleCron) {
      // Basic weekday check for 1-5
      const day = dateObj.getUTCDay();
      const isWeekday = day >= 1 && day <= 5;
      if (scheduleCron.includes("1-5") && !isWeekday) return false;
      return true;
    }
    return false;
  });

  // Fetch active employees
  const { data: employees, error: employeesError } = await admin
    .from("employees")
    .select("id, status")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .limit(5000);

  if (employeesError) throw new Error(employeesError.message);

  const activeEmployees = (employees ?? []).filter((e) => {
    const status = (e as { status?: string }).status;
    return !status || status === "active";
  });

  let tasksGenerated = 0;

  for (const template of runnableTemplates) {
    const stepsJson = (template as { steps_json?: Json }).steps_json ?? ([] as unknown as Json);
    const steps = Array.isArray(stepsJson) ? stepsJson : [];

    for (const employee of activeEmployees) {
      const payload = {
        template_id: template.id,
        template_title: (template as { title?: string }).title ?? "Workflow",
        employee_id: employee.id,
        task_date: taskDate,
        steps: steps,
        generated_at: new Date().toISOString(),
        generated_via: "cron",
      };

      const { error: upsertError } = await admin
        .from("daily_employee_tasks")
        .upsert(
          {
            organization_id: organizationId,
            employee_id: employee.id,
            workflow_template_id: template.id,
            task_date: taskDate,
            status: "pending",
            payload_json: payload as unknown as Json,
            due_time: (template as { schedule_time?: string | null }).schedule_time ?? null,
          } as Database["public"]["Tables"]["daily_employee_tasks"]["Insert"],
          {
            onConflict: "organization_id,employee_id,task_date,workflow_template_id",
          },
        );

      if (!upsertError) {
        tasksGenerated++;
      }
    }
  }

  // Log execution
  await admin.from("workflow_executions").insert({
    organization_id: organizationId,
    status: "succeeded",
    execution_payload: {
      action: "cron.generateDailyWorkflows",
      task_date: taskDate,
      templates: runnableTemplates.length,
      employees: activeEmployees.length,
      tasks_generated: tasksGenerated,
    } as unknown as Json,
    result_json: {
      tasksGenerated,
    } as unknown as Json,
    triggered_by: "cron",
  } as Database["public"]["Tables"]["workflow_executions"]["Insert"]);

  return {
    tasksGenerated,
    employeesScanned: activeEmployees.length,
    templatesEvaluated: runnableTemplates.length,
  };
}
