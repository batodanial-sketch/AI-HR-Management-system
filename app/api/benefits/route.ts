import { z } from "zod";
import { getBenefitPlans } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Benefit plans are org-wide HR data — HR_ADMIN+ only. */
const createSchema = z.object({
  name: z.string().min(2).max(200),
  provider: z.string().max(200).optional().nullable(),
  planType: z.string().min(2).max(80),
  employeeCost: z.number().nonnegative().default(0),
  employerCost: z.number().nonnegative().default(0),
  status: z.enum(["draft", "active", "closed", "archived"]).default("draft"),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getBenefitPlans, { minRole: "HR_ADMIN" });
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate(
    "benefit_plans",
    createSchema,
    input,
    (parsed) => ({
      name: parsed.name,
      provider: parsed.provider ?? null,
      plan_type: parsed.planType,
      employee_cost: parsed.employeeCost,
      employer_cost: parsed.employerCost,
      status: parsed.status,
    }),
    { minRole: "HR_ADMIN" },
  );
}
