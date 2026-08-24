import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateBuilder } from "@/components/workflows/template-builder";

export const metadata: Metadata = { title: "Workflow Templates" };

/**
 * Admin Workflow Template Builder — CRUD for workflow_templates
 * Step builder for attendance auto-log, performance pulses, notifications, AI digests
 * Role targeting selector + manual trigger via generateDailyWorkflowsAction
 */
export default function WorkflowTemplatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow Templates"
        description="Create, edit, activate/deactivate recurring workflow templates with steps (attendance auto-log, performance pulses, notifications, AI digests) and role targeting. Manual trigger for instant testing."
      />
      <TemplateBuilder />
    </div>
  );
}
