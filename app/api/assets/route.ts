import { z } from "zod";
import { getAssets } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  assetTag: z.string().min(2).max(120),
  name: z.string().min(2).max(240),
  category: z.string().min(2).max(120),
  status: z.enum(["available", "assigned", "maintenance", "retired", "lost"]).default("available"),
  assignee: z.string().max(240).optional().nullable(),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getAssets);
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate("assets", createSchema, input, (parsed) => ({
    asset_tag: parsed.assetTag,
    name: parsed.name,
    category: parsed.category,
    status: parsed.status,
    assignee: parsed.assignee ?? null,
  }));
}
