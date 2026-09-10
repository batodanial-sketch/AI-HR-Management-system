import { z } from "zod";
import { workflowStepsSchema, type WorkflowStepDefinition } from "./steps";

/**
 * Executable workflow templates — the server-side allowlist (v1: 3).
 *
 * Each template builds a complete, runnable step graph from caller-supplied
 * params. Params are UNTRUSTED (they may come from the model via
 * `propose_workflow`): every field is zod-validated, and the built steps
 * are re-validated against `workflowStepsSchema` before anything is saved.
 * Instantiation always produces a DRAFT — a human activates it.
 */

const templateId = z.enum(["new_hire_welcome", "leave_request_review", "payroll_completion_digest"]);
export type WorkflowTemplateId = z.infer<typeof templateId>;

const notifyParams = z.object({
  notifyUserIds: z.array(z.string().uuid()).min(1).max(20),
  title: z.string().trim().min(1).max(200).default("Workflow notification"),
  message: z.string().trim().min(1).max(2000).default("A workflow event fired."),
});

const leaveReviewParams = z.object({
  notifyUserIds: z.array(z.string().uuid()).min(1).max(20),
  approverMinRole: z.enum(["HR_ADMIN", "MANAGER"]).default("MANAGER"),
});

export interface WorkflowTemplate {
  id: WorkflowTemplateId;
  name: string;
  description: string;
  triggerType: "event";
  triggerEvent: string;
  paramsSchema: z.ZodTypeAny;
  defaultParams: Record<string, unknown>;
  build: (params: Record<string, unknown>) => { name: string; steps: WorkflowStepDefinition[] };
}

const notifyEndSteps = (keyPrefix: string, userIds: string[], title: string, body: string): WorkflowStepDefinition[] =>
  workflowStepsSchema.parse([
    { key: `${keyPrefix}_notify`, type: "notify", title, config: { userIds, title, body } },
    { key: `${keyPrefix}_done`, type: "end", title: "Done", config: {} },
  ]);

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "new_hire_welcome",
    name: "New hire welcome",
    description: "Notifies the hiring team when an employee record is created.",
    triggerType: "event",
    triggerEvent: "employee.created",
    paramsSchema: notifyParams,
    defaultParams: { notifyUserIds: [], title: "Welcome aboard", message: "A new employee record was created." },
    build: (params) => {
      const parsed = notifyParams.parse(params);
      return {
        name: "New hire welcome",
        steps: notifyEndSteps("welcome", parsed.notifyUserIds, parsed.title, parsed.message),
      };
    },
  },
  {
    id: "leave_request_review",
    name: "Leave request review",
    description: "Routes a leave request to a human approver, then notifies the team of the outcome.",
    triggerType: "event",
    triggerEvent: "leave.requested",
    paramsSchema: leaveReviewParams,
    defaultParams: { notifyUserIds: [], approverMinRole: "MANAGER" },
    build: (params) => {
      const parsed = leaveReviewParams.parse(params);
      return {
        name: "Leave request review",
        steps: workflowStepsSchema.parse([
          {
            key: "review",
            type: "approval",
            title: "Review leave request",
            config: {
              title: "Leave request needs review",
              reason: "A leave request was submitted and requires a human decision before any balances change.",
              approverMinRole: parsed.approverMinRole,
              notifyUserIds: parsed.notifyUserIds,
              context: {
                why: "Leave balances and coverage change only after a human approves the request.",
                evidence: ["The triggering leave.requested event payload"],
                changes: ["Leave request status advances on approval"],
                affected: "The requesting employee and their team coverage",
                reversible: true,
              },
            },
          },
          {
            key: "inform",
            type: "notify",
            title: "Inform team",
            config: { userIds: parsed.notifyUserIds, title: "Leave decision recorded", body: "The leave request was approved." },
          },
          { key: "done", type: "end", title: "Done", config: {} },
        ]),
      };
    },
  },
  {
    id: "payroll_completion_digest",
    name: "Payroll completion digest",
    description: "Notifies payroll stakeholders when a payroll run completes.",
    triggerType: "event",
    triggerEvent: "payroll.completed",
    paramsSchema: notifyParams,
    defaultParams: { notifyUserIds: [], title: "Payroll completed", message: "A payroll run completed." },
    build: (params) => {
      const parsed = notifyParams.parse(params);
      return {
        name: "Payroll completion digest",
        steps: notifyEndSteps("payroll", parsed.notifyUserIds, parsed.title, parsed.message),
      };
    },
  },
];

// Fail fast at import: every template must build valid steps from valid params.
for (const template of WORKFLOW_TEMPLATES) {
  template.build({ ...template.defaultParams, notifyUserIds: ["11111111-1111-4111-8111-111111111111"] });
}
