/**
 * Phase F step vocabulary: definition validation (allowlist, no smuggling)
 * and pure condition evaluation. No I/O.
 */
import { evaluateCondition, workflowStepsSchema } from "@/lib/workflows/steps";

const notify = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  type: "notify" as const,
  title: "Ping",
  config: { userIds: ["11111111-1111-4111-8111-111111111111"], title: "Hi", body: "Hello", ...extra },
});

describe("workflowStepsSchema", () => {
  it("accepts a valid flow and rejects unknown step types", () => {
    expect(workflowStepsSchema.safeParse([notify("n1"), { key: "done", type: "end", title: "Done", config: {} }]).success).toBe(true);
    const bad = workflowStepsSchema.safeParse([{ key: "x", type: "webhook_call", title: "X", config: {} }]);
    expect(bad.success).toBe(false);
  });
  it("rejects duplicate keys, bad jumps and oversized flows", () => {
    expect(workflowStepsSchema.safeParse([notify("n1"), notify("n1")]).success).toBe(false);
    expect(
      workflowStepsSchema.safeParse([
        { key: "c1", type: "condition", title: "C", config: { if: { field: "trigger.a", op: "eq", value: 1 }, then: "ghost", else: null } },
      ]).success,
    ).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => notify(`n${i}`));
    expect(workflowStepsSchema.safeParse(many).success).toBe(false);
  });
  it("validates per-type configs (notify/appoval/tool/wait bounds)", () => {
    expect(workflowStepsSchema.safeParse([notify("n1", { link: "https://evil.example/x" })]).success).toBe(false);
    expect(workflowStepsSchema.safeParse([notify("n1", { userIds: ["not-a-uuid"] })]).success).toBe(false);
    const approval = { key: "a1", type: "approval", title: "A", config: { title: "T", reason: "R", context: { why: "because" } } };
    expect(workflowStepsSchema.safeParse([approval]).success).toBe(true);
    const waitFar = { key: "w1", type: "wait_until", title: "W", config: { until: new Date(Date.now() + 31 * 86400_000).toISOString() } };
    expect(workflowStepsSchema.safeParse([waitFar]).success).toBe(false);
    const waitOk = { key: "w1", type: "wait_until", title: "W", config: { until: new Date(Date.now() + 3600_000).toISOString() } };
    expect(workflowStepsSchema.safeParse([waitOk]).success).toBe(true);
  });
});

describe("evaluateCondition", () => {
  const context = { trigger: { count: 12, name: "Ada", tags: ["x"] }, steps: { lookup: { ok: true, message: "3 rows" } } };
  it("evaluates comparison operators over allowlisted roots", () => {
    expect(evaluateCondition({ field: "trigger.count", op: "gt", value: 10 }, context)).toBe(true);
    expect(evaluateCondition({ field: "trigger.count", op: "lte", value: 12 }, context)).toBe(true);
    expect(evaluateCondition({ field: "trigger.name", op: "eq", value: "Ada" }, context)).toBe(true);
    expect(evaluateCondition({ field: "trigger.name", op: "contains", value: "d" }, context)).toBe(true);
    expect(evaluateCondition({ field: "trigger.count", op: "in", value: [10, 12] }, context)).toBe(true);
    expect(evaluateCondition({ field: "trigger.missing", op: "empty", value: null }, context)).toBe(true);
    expect(evaluateCondition({ field: "steps.lookup.ok", op: "eq", value: true }, context)).toBe(true);
    expect(evaluateCondition({ field: "trigger.count", op: "gt", value: 99 }, context)).toBe(false);
  });
  it("rejects non-allowlisted roots, deep paths and prototype smuggling", () => {
    expect(evaluateCondition({ field: "process.env.SECRET", op: "empty", value: null }, context)).toBe(true);
    expect(evaluateCondition({ field: "trigger.a.b.c.d.e", op: "empty", value: null }, context)).toBe(true);
    expect(evaluateCondition({ field: "__proto__.x", op: "empty", value: null }, context)).toBe(true);
    expect(evaluateCondition({ field: "constructor", op: "empty", value: null }, context)).toBe(true);
    // eq against a rejected path never matches (fail closed, no throw).
    expect(evaluateCondition({ field: "process.env.SECRET", op: "eq", value: "x" }, context)).toBe(false);
  });
  it("type-strict numerics never coerce", () => {
    expect(evaluateCondition({ field: "trigger.name", op: "gt", value: 1 }, context)).toBe(false);
    expect(evaluateCondition({ field: "trigger.count", op: "gt", value: "10" }, context)).toBe(false);
  });
});
