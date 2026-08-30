import { z } from "zod";
import { getPulseSurveys } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pulse surveys are org-wide HR instruments — HR_ADMIN+ only. */
const createSchema = z.object({
  title: z.string().min(2).max(240),
  description: z.string().max(2000).optional().nullable(),
  anonymous: z.boolean().default(true),
  status: z.enum(["draft", "published", "closed"]).default("draft"),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getPulseSurveys, { minRole: "HR_ADMIN" });
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate(
    "pulse_surveys",
    createSchema,
    input,
    (parsed) => ({
      title: parsed.title,
      description: parsed.description ?? null,
      anonymous: parsed.anonymous,
      status: parsed.status,
    }),
    { minRole: "HR_ADMIN" },
  );
}
