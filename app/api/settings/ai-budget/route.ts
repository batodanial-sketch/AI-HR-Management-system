import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getRbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import {
  checkAiBudget,
  getAiBudget,
  getAiUsageSummary,
  setAiBudget,
} from "@/lib/ai/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI Budget & Usage — `/api/settings/ai-budget`.
 *
 *   GET  → current-month usage summary + budget settings + live decision
 *          (any authenticated member).
 *   PATCH → update monthly token/cost caps + fallback routing
 *          (HR_ADMIN / SUPER_ADMIN only).
 */

const budgetPatchSchema = z.object({
  monthlyTokenCap: z.number().int().positive().max(1_000_000_000_000).nullable().optional(),
  monthlyCostCapUsd: z.number().nonnegative().max(1_000_000).nullable().optional(),
  fallbackModel: z.string().min(1).max(120).nullable().optional(),
  fallbackProvider: z.string().min(1).max(80).nullable().optional(),
  enabled: z.boolean().optional(),
});

export async function GET(): Promise<Response> {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.organizationId) {
    return Response.json({ ok: false, error: "Unauthorized — no organization context." }, { status: 401 });
  }
  const [summary, budget, decision] = await Promise.all([
    getAiUsageSummary(user.organizationId),
    getAiBudget(user.organizationId),
    checkAiBudget(user.organizationId),
  ]);
  return Response.json({ ok: true, summary, budget, decision });
}

export async function PATCH(request: Request): Promise<Response> {
  const parsed = budgetPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
          .join(" · "),
      },
      { status: 400 },
    );
  }

  const ctx = await getRbacContext().catch(() => null);
  if (!ctx) {
    return Response.json({ ok: false, error: "Unauthorized — no organization context." }, { status: 401 });
  }
  if (!ctx.demoMode && !roleAtLeast(ctx.role, "HR_ADMIN")) {
    return Response.json(
      { ok: false, error: `RBAC: HR_ADMIN role required to update AI budgets — the ${ctx.role} role is not authorized.`, code: "RBAC_FORBIDDEN" },
      { status: 403 },
    );
  }

  const budget = await setAiBudget(ctx.organizationId, parsed.data).catch((error: unknown) => {
    return error instanceof Error ? error : new Error("Unable to save AI budget settings.");
  });
  if (budget instanceof Error) {
    return Response.json({ ok: false, error: budget.message }, { status: 500 });
  }

  await recordAuditLog({
    actorId: ctx.user.id,
    actorType: "USER",
    action: "settings.ai_budget.update",
    targetModule: "settings",
    changes: parsed.data as unknown as Record<string, unknown>,
    organizationId: ctx.organizationId,
  });

  const summary = await getAiUsageSummary(ctx.organizationId);
  const decision = await checkAiBudget(ctx.organizationId);
  return Response.json({ ok: true, summary, budget, decision });
}
