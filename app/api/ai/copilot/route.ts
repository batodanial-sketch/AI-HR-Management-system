import { proxyToBridge } from "@/lib/ai-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return proxyToBridge(request, "/api/ai/copilot");
}
