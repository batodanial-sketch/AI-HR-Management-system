import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DailyTaskBoard } from "@/components/workflows/daily-task-board";
import { ExecutionLogs } from "@/components/workflows/execution-logs";

export const metadata: Metadata = { title: "Daily Workflows" };

/**
 * Employee Daily Task Board — user-facing UI for daily_employee_tasks
 * Consumes listDailyTasksAction, updateTaskStatusAction, executeWorkflowStepAction
 * Includes Execution Telemetry View (workflow_executions)
 */
export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Workflows"
        description="Resilient, high-throughput task engine — daily tasks per employee, step execution, and audit telemetry. Org-isolated RLS via is_organization_member."
      />
      <DailyTaskBoard />
      <ExecutionLogs />
    </div>
  );
}
