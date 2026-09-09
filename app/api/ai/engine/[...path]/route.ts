import { proxyToBridge } from "@/lib/ai-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catch-all proxy for the ML engine endpoints (`python_engine/*`).
 *
 * Forwards `/api/ai/engine/*` → bridge `/api/engine/*`, inheriting the
 * rate-limiting + AI-usage metering in `proxyToBridge`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const pathname = `/api/engine/${path.join("/")}`;
  return proxyToBridge(request, pathname);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const pathname = `/api/engine/${path.join("/")}`;
  return proxyToBridge(request, pathname);
}
