import { z } from "zod";
import { getAssets } from "@/lib/domain";
import {
  handleModuleCreate,
  handleModuleList,
  moduleError,
  moduleScopedContext,
  scopedAssetList,
} from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  assetTag: z.string().min(2).max(120),
  name: z.string().min(2).max(240),
  category: z.string().min(2).max(120),
  status: z.enum(["available", "assigned", "maintenance", "retired", "lost"]).default("available"),
  assignee: z.string().max(240).optional().nullable(),
});

/**
 * Assets are personal when assigned:
 *  - EMPLOYEE / MANAGER → only assets assigned to self / direct reports
 *  - HR_ADMIN / SUPER_ADMIN → org-wide inventory + writes
 */
export async function GET(): Promise<Response> {
  const ctx = await moduleScopedContext();
  if (!ctx) return moduleError("Unauthorized — no organization context.", 401);
  if (ctx.scope !== "org") {
    return handleModuleList(() => scopedAssetList(ctx));
  }
  return handleModuleList(getAssets);
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate(
    "assets",
    createSchema,
    input,
    (parsed) => ({
      asset_tag: parsed.assetTag,
      name: parsed.name,
      category: parsed.category,
      status: parsed.status,
      assignee: parsed.assignee ?? null,
    }),
    { minRole: "HR_ADMIN" },
  );
}
