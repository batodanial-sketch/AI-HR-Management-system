/**
 * Template bridge proofs: the 3-template allowlist builds valid steps from
 * validated params only; unknown templates and bad params fail VALIDATION.
 */
jest.mock("server-only", () => ({}), { virtual: true });

import { instantiateTemplate, listTemplates, templateForInsightCategory } from "@/lib/workflows/bridge";
import { WORKFLOW_TEMPLATES } from "@/lib/workflows/templates";
import { workflowStepsSchema } from "@/lib/workflows/steps";

const USER = "11111111-1111-4111-8111-111111111111";

describe("workflow template bridge", () => {
  it("lists exactly the v1 allowlist", () => {
    expect(WORKFLOW_TEMPLATES.map((t) => t.id).sort()).toEqual(["leave_request_review", "new_hire_welcome", "payroll_completion_digest"]);
    expect(listTemplates()).toHaveLength(3);
  });

  it("maps insight families to templates, null when nothing fits", () => {
    expect(templateForInsightCategory("onboarding")).toBe("new_hire_welcome");
    expect(templateForInsightCategory("leave")).toBe("leave_request_review");
    expect(templateForInsightCategory("performance")).toBeNull();
    expect(templateForInsightCategory("not-a-category")).toBeNull();
  });

  it("instantiates templates with validated params into runnable steps", () => {
    const built = instantiateTemplate("leave_request_review", { notifyUserIds: [USER], approverMinRole: "MANAGER" });
    expect(built.triggerEvent).toBe("leave.requested");
    expect(workflowStepsSchema.safeParse(built.steps).success).toBe(true);
    expect(built.steps.map((s) => s.type)).toEqual(["approval", "notify", "end"]);
    const welcome = instantiateTemplate("new_hire_welcome", { notifyUserIds: [USER] });
    expect(welcome.steps.map((s) => s.type)).toEqual(["notify", "end"]);
  });

  it("rejects unknown templates and untrusted params with VALIDATION", () => {
    expect(() => instantiateTemplate("nope", {})).toThrow(expect.objectContaining({ code: "VALIDATION" }));
    // Empty notify list, non-uuid members, unknown tiers all die here.
    expect(() => instantiateTemplate("new_hire_welcome", { notifyUserIds: [] })).toThrow(expect.objectContaining({ code: "VALIDATION" }));
    expect(() => instantiateTemplate("new_hire_welcome", { notifyUserIds: ["stranger"] })).toThrow(expect.objectContaining({ code: "VALIDATION" }));
    expect(() => instantiateTemplate("leave_request_review", { notifyUserIds: [USER], approverMinRole: "EMPLOYEE" })).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
  });
});
