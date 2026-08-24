import type { Metadata } from "next";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Workflow Builder",
};

export default function WorkflowBuilderPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow Builder"
        description="Compose automations from triggers, actions and conditions."
      />
      <WorkflowCanvas />
    </div>
  );
}
