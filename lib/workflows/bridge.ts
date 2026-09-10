import type { InsightCategory } from "@/lib/intelligence/types";
import { WorkflowDriveError } from "./executor";
import { WORKFLOW_TEMPLATES, type WorkflowTemplateId } from "./templates";
import type { WorkflowStepDefinition } from "./steps";

/**
 * Template bridge — insight → draft suggestion + validated instantiation.
 *
 * `templateForInsightCategory` is a pure suggestion map (null = no
 * executable template fits that insight family — the caller says so
 * honestly instead of inventing one). `instantiateTemplate` validates the
 * caller's params against the template's schema and returns a
 * definition draft + runnable steps; unknown templates and bad params
 * fail with VALIDATION, never with a half-built graph.
 */

const INSIGHT_TEMPLATE_MAP: Partial<Record<InsightCategory, WorkflowTemplateId>> = {
  onboarding: "new_hire_welcome",
  leave: "leave_request_review",
};

export function templateForInsightCategory(category: string): WorkflowTemplateId | null {
  return INSIGHT_TEMPLATE_MAP[category as InsightCategory] ?? null;
}

export function listTemplates(): { id: WorkflowTemplateId; name: string; description: string; triggerEvent: string }[] {
  return WORKFLOW_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    triggerEvent: template.triggerEvent,
  }));
}

export function instantiateTemplate(
  templateId: string,
  params: unknown,
): { name: string; triggerType: "event"; triggerEvent: string; steps: WorkflowStepDefinition[] } {
  const template = WORKFLOW_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new WorkflowDriveError("VALIDATION", `Unknown workflow template '${templateId}'.`);
  }
  const parsedParams = template.paramsSchema.safeParse(params ?? {});
  if (!parsedParams.success) {
    const first = parsedParams.error.issues[0];
    throw new WorkflowDriveError("VALIDATION", `Invalid template params: ${first?.path.join(".") || "input"} — ${first?.message ?? "rejected"}.`);
  }
  try {
    const built = template.build(parsedParams.data as Record<string, unknown>);
    return { name: built.name, triggerType: template.triggerType, triggerEvent: template.triggerEvent, steps: built.steps };
  } catch (error) {
    throw new WorkflowDriveError("VALIDATION", error instanceof Error ? error.message : "Template build failed.");
  }
}
