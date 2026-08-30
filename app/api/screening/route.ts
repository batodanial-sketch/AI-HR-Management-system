import { z } from "zod";
import { getScreeningRecords } from "@/lib/domain";
import { handleModuleCreate, handleModuleList } from "@/lib/module-crud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  candidateId: z.string().uuid(),
  role: z.string().min(2).max(200),
  score: z.number().min(0).max(100),
  recommendation: z.enum(["advance", "hold", "reject"]),
  modelProvider: z.string().max(120).optional().nullable(),
  modelName: z.string().max(120).optional().nullable(),
  promptVersion: z.string().max(80).optional().nullable(),
});

export async function GET(): Promise<Response> {
  return handleModuleList(getScreeningRecords);
}

export async function POST(request: Request): Promise<Response> {
  const input = await request.json().catch(() => null);
  return handleModuleCreate("candidate_ai_assessments", createSchema, input, (parsed) => ({
    candidate_id: parsed.candidateId,
    model_provider: parsed.modelProvider ?? "manual",
    model_name: parsed.modelName ?? "copilot-v1",
    prompt_version: parsed.promptVersion ?? "v1",
    overall_score: parsed.score,
    job_match_score: parsed.score,
    score: parsed.score,
    recommendation: parsed.recommendation,
    role: parsed.role,
    reviewed_at: new Date().toISOString().slice(0, 10),
  }));
}
