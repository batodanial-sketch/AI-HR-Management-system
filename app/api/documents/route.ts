import { z } from "zod";
import { getDocuments } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(300),
  kind: z.string().min(2).max(120),
  owner: z.string().max(240).optional().nullable(),
  sizeKb: z.number().int().nonnegative().optional().nullable(),
  storageKey: z.string().max(500).optional().nullable(),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getDocuments);
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate("documents", createSchema, input, (parsed) => ({
    title: parsed.name,
    name: parsed.name,
    category: parsed.kind,
    kind: parsed.kind,
    owner: parsed.owner ?? null,
    size_kb: parsed.sizeKb ?? null,
    uploaded_at: new Date().toISOString().slice(0, 10),
    storage_key: parsed.storageKey ?? null,
  }));
}
