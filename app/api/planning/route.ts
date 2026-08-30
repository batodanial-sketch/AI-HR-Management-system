import { z } from "zod";
import { getWorkforceScenarios } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Workforce scenarios are org-wide planning data — HR_ADMIN+ only. */
const createSchema = z.object({
  name: z.string().min(2).max(200),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  headcountForecast: z.number().nonnegative().optional().nullable(),
  budgetForecast: z.number().nonnegative().optional().nullable(),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getWorkforceScenarios, { minRole: "HR_ADMIN" });
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate(
    "workforce_scenarios",
    createSchema,
    input,
    (parsed) => ({
      name: parsed.name,
      status: parsed.status,
      headcount_forecast: parsed.headcountForecast ?? null,
      budget_forecast: parsed.budgetForecast ?? null,
      assumptions: {
        headcountForecast: parsed.headcountForecast ?? null,
        budgetForecast: parsed.budgetForecast ?? null,
      },
    }),
    { minRole: "HR_ADMIN" },
  );
}
