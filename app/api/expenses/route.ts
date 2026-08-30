import { z } from "zod";
import { getExpenses } from "@/lib/domain";
import {
  handleModuleCreate,
  handleModuleList,
  moduleError,
  moduleScopedContext,
  scopedExpenseList,
} from "@/lib/module-crud";
import { notifyWebhookEvent } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  merchant: z.string().max(200).optional().nullable(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().min(2).max(80),
  amount: z.number().nonnegative(),
  currencyCode: z.string().length(3).transform((value) => value.toUpperCase()),
  receiptKey: z.string().max(500).optional().nullable(),
});

/**
 * Expenses are personal records:
 *  - EMPLOYEE → own expenses only
 *  - MANAGER  → self + direct reports
 *  - HR_ADMIN / SUPER_ADMIN → org-wide
 */
export async function GET(): Promise<Response> {
  const ctx = await moduleScopedContext();
  if (!ctx) return moduleError("Unauthorized — no organization context.", 401);
  if (ctx.scope !== "org") {
    return handleModuleList(() => scopedExpenseList(ctx));
  }
  return handleModuleList(getExpenses);
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate(
    "expense_reports",
    createSchema,
    input,
    (parsed) => ({
      employee_id: parsed.employeeId,
      merchant: parsed.merchant ?? null,
      expense_date: parsed.expenseDate,
      category: parsed.category,
      amount: parsed.amount,
      currency_code: parsed.currencyCode,
      currency: parsed.currencyCode,
      receipt_key: parsed.receiptKey ?? null,
      status: "submitted",
    }),
    {
      minRole: "EMPLOYEE",
      employeeIdField: "employee_id",
      employeeIdFromPayload: (p) => p.employeeId,
    },
    {
      onCreated: (data, ctx) =>
        notifyWebhookEvent(
          "expense.created",
          {
            expense: data,
            organizationId: ctx.organizationId,
            createdAt: new Date().toISOString(),
          },
          ctx.organizationId,
        ),
    },
  );
}
