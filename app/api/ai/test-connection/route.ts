import { proxyToBridge } from "@/lib/ai-proxy";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return proxyToBridge(request, "/api/ai/test");
}
