import { z } from "zod";
import { getEquityGrants } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  grantType: z.enum(["option", "rsu", "share", "phantom"]),
  quantity: z.number().positive(),
  strikePrice: z.number().nonnegative().optional().nullable(),
  vestingMonths: z.number().int().positive().max(120),
  grantDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["draft", "active", "exercised", "cancelled", "expired"]).default("active"),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getEquityGrants);
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate("equity_grants", createSchema, input, (parsed) => ({
    employee_id: parsed.employeeId,
    grant_type: parsed.grantType,
    quantity: parsed.quantity,
    strike_price: parsed.strikePrice ?? null,
    vesting_months: parsed.vestingMonths,
    grant_date: parsed.grantDate,
    vesting_start_date: parsed.grantDate,
    status: parsed.status,
  }));
}
