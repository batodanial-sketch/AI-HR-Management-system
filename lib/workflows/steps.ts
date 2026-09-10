import { z } from "zod";

/**
 * Phase F executable step vocabulary — zod-validated, allowlisted, no
 * arbitrary types. Unknown step types are rejected at definition time
 * (VALIDATION_ERROR), so prompt-injected or hand-edited definitions can
 * never smuggle an executable the engine does not know.
 *
 * Visibility into data: steps read the run context
 * `{ trigger, steps: { <key>: <output> } }` through allowlisted JSON paths
 * only (condition predicates). Config strings are DATA (notification copy,
 * labels) — never interpreted as instructions by anything.
 */

export const STEP_TYPES = ["condition", "notify", "approval", "tool_call", "wait_until", "end"] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const MAX_STEPS_PER_WORKFLOW = 50;
/** Total step visits per run — the hard anti-loop ceiling (§19). */
export const MAX_STEP_VISITS_PER_RUN = 100;

const stepKey = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i);

const conditionPredicate = z.object({
  /** Allowlisted root: trigger.* or steps.<key>.* (depth ≤ 4, segments [a-z0-9_]). */
  field: z.string().trim().min(1).max(200),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in", "empty"]),
  value: z.unknown(),
});

const conditionConfig = z.object({
  if: conditionPredicate,
  /** Step key to jump to, or null = next step in order. */
  then: stepKey.nullable().default(null),
  else: stepKey.nullable().default(null),
});

const internalLink = z
  .string()
  .max(300)
  .regex(/^\/[a-z0-9/_-]*$/i, "link must be an internal app path")
  .optional();

const notifyConfig = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(20),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  link: internalLink,
});

const approvalContext = z.object({
  why: z.string().trim().min(1).max(2000),
  evidence: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  changes: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  affected: z.string().trim().max(500).default(""),
  reversible: z.boolean().default(false),
});

const approvalConfig = z.object({
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(2000),
  /** Minimum tier allowed to decide (default HR_ADMIN). */
  approverMinRole: z.enum(["HR_ADMIN", "MANAGER"]).default("HR_ADMIN"),
  /** Explicit members to notify that approval was requested (verified). */
  notifyUserIds: z.array(z.string().uuid()).max(20).default([]),
  context: approvalContext,
});

const toolCallConfig = z.object({
  /** Copilot tool name — must additionally pass the workflow tool policy. */
  tool: z.string().trim().min(1).max(120),
  /** Arguments validated by the tool's own zod schema at execution time. */
  args: z.record(z.string(), z.unknown()).default({}),
});

const waitUntilConfig = z.object({
  /** ISO timestamp ≤ 30 days out; resume is operator-driven in v1. */
  until: z.string().datetime(),
});

const endConfig = z.object({
  status: z.enum(["succeeded", "failed"]).default("succeeded"),
  note: z.string().trim().max(1000).default(""),
});

const CONFIG_BY_TYPE = {
  condition: conditionConfig,
  notify: notifyConfig,
  approval: approvalConfig,
  tool_call: toolCallConfig,
  wait_until: waitUntilConfig,
  end: endConfig,
} as const;

export const workflowStepSchema = z
  .object({
    key: stepKey,
    type: z.enum(STEP_TYPES),
    title: z.string().trim().min(1).max(200),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((step, ctx) => {
    const schema = CONFIG_BY_TYPE[step.type];
    const parsed = schema.safeParse(step.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `config.${issue.path.join(".") || "input"}: ${issue.message}` });
      }
    }
    if (step.type === "wait_until") {
      const until = Date.parse(String((step.config as { until?: unknown }).until ?? ""));
      if (Number.isNaN(until)) return;
      const horizon = Date.now() + 30 * 24 * 3600 * 1000;
      if (until > horizon || until < Date.now() - 24 * 3600 * 1000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "config.until: must be within the last day and the next 30 days." });
      }
    }
  })
  .transform((step) => {
    // Normalize: the executor consumes parsed output, so inner defaults
    // (end.status, condition.then/else, approval.notifyUserIds, …) must be
    // materialized here — the raw `config` record alone is not enough.
    const schema = CONFIG_BY_TYPE[step.type];
    const parsed = schema.safeParse(step.config);
    return {
      ...step,
      config: (parsed.success ? parsed.data : step.config) as Record<string, unknown>,
    };
  });

export type WorkflowStepDefinition = z.infer<typeof workflowStepSchema> & { config: Record<string, unknown> };

export const workflowStepsSchema = z
  .array(workflowStepSchema)
  .min(1)
  .max(MAX_STEPS_PER_WORKFLOW)
  .superRefine((steps, ctx) => {
    const keys = new Set<string>();
    for (const step of steps) {
      if (keys.has(step.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate step key: ${step.key}` });
      keys.add(step.key);
    }
    for (const step of steps) {
      if (step.type !== "condition") continue;
      const config = step.config as { then?: string | null; else?: string | null };
      for (const target of [config.then, config.else]) {
        if (target && !keys.has(target)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `condition ${step.key} jumps to unknown step: ${target}` });
        }
      }
    }
  });

/** Run context visible to condition predicates (allowlisted roots only). */
export interface RunContext {
  trigger: Record<string, unknown>;
  steps: Record<string, unknown>;
}

const PATH_SEGMENT = /^[a-zA-Z0-9_]+$/;

function readPath(context: RunContext, field: string): { ok: boolean; value: unknown } {
  const parts = field.split(".");
  if (parts.length < 1 || parts.length > 5) return { ok: false, value: undefined };
  if (parts[0] !== "trigger" && parts[0] !== "steps") return { ok: false, value: undefined };
  if (!parts.every((segment) => PATH_SEGMENT.test(segment))) return { ok: false, value: undefined };
  let current: unknown = context;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) return { ok: false, value: undefined };
    current = (current as Record<string, unknown>)[part];
  }
  return { ok: true, value: current };
}

/** Pure predicate evaluation over the run context (deterministic). */
export function evaluateCondition(
  predicate: z.infer<typeof conditionPredicate>,
  context: RunContext,
): boolean {
  const found = readPath(context, predicate.field);
  const actual = found.value;
  switch (predicate.op) {
    case "empty":
      return !found.ok || actual === null || actual === undefined || actual === "" || (Array.isArray(actual) && actual.length === 0);
    case "eq":
      return found.ok && actual === predicate.value;
    case "neq":
      return !found.ok || actual !== predicate.value;
    case "gt":
      return found.ok && typeof actual === "number" && typeof predicate.value === "number" && actual > predicate.value;
    case "gte":
      return found.ok && typeof actual === "number" && typeof predicate.value === "number" && actual >= predicate.value;
    case "lt":
      return found.ok && typeof actual === "number" && typeof predicate.value === "number" && actual < predicate.value;
    case "lte":
      return found.ok && typeof actual === "number" && typeof predicate.value === "number" && actual <= predicate.value;
    case "contains":
      return found.ok && typeof actual === "string" && typeof predicate.value === "string" && actual.includes(predicate.value);
    case "in":
      return found.ok && Array.isArray(predicate.value) && predicate.value.includes(actual);
  }
}
