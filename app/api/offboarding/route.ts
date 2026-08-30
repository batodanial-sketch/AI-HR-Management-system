import { z } from "zod";
import { getOffboardingCases } from "@/lib/domain";
import {
  handleModuleCreate,
  handleModuleList,
  handleModuleUpdate,
  moduleError,
  moduleScopedContext,
  scopedOffboardingList,
} from "@/lib/module-crud";
import { notifyWebhookEvent } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(1000).optional().nullable(),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]).default("planned"),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]),
});

/**
 * Offboarding cases are personal records:
 *  - EMPLOYEE → own case only (read)
 *  - MANAGER  → self + direct reports
 *  - HR_ADMIN / SUPER_ADMIN → org-wide, including creating cases
 */
export async function GET(): Promise<Response> {
  const ctx = await moduleScopedContext();
  if (!ctx) return moduleError("Unauthorized — no organization context.", 401);
  if (ctx.scope !== "org") {
    return handleModuleList(() => scopedOffboardingList(ctx));
  }
  return handleModuleList(getOffboardingCases);
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate(
    "offboarding_cases",
    createSchema,
    input,
    (parsed, ctx) => ({
      employee_id: parsed.employeeId,
      initiated_by: ctx.userId,
      effective_date: parsed.effectiveDate,
      exit_date: parsed.effectiveDate,
      reason: parsed.reason ?? null,
      status: parsed.status,
    }),
    {
      minRole: "MANAGER",
      employeeIdField: "employee_id",
      employeeIdFromPayload: (p) => p.employeeId,
    },
  );
}

/** Status transitions (approve/complete a case) under the same scope policy. */
export async function PATCH(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleUpdate(
    "offboarding_cases",
    updateSchema,
    input,
    (parsed) => ({
      status: parsed.status,
      ...(parsed.status === "completed"
        ? { completed_at: new Date().toISOString() }
        : {}),
    }),
    {
      minRole: "MANAGER",
      employeeIdField: "employee_id",
    },
    {
      onUpdated: (data, parsed, ctx) =>
        parsed.status === "completed"
          ? notifyWebhookEvent(
              "offboarding.completed",
              {
                offboardingCase: data,
                organizationId: ctx.organizationId,
                completedAt: new Date().toISOString(),
              },
              ctx.organizationId,
            )
          : undefined,
    },
  );
}
