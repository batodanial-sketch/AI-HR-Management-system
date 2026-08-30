import { z } from "zod";
import { getOffboardingCases } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(1000).optional().nullable(),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]).default("planned"),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getOffboardingCases);
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate("offboarding_cases", createSchema, input, (parsed, ctx) => ({
    employee_id: parsed.employeeId,
    initiated_by: ctx.userId,
    effective_date: parsed.effectiveDate,
    exit_date: parsed.effectiveDate,
    reason: parsed.reason ?? null,
    status: parsed.status,
  }));
}
