import { bridgeUrl, bridgeSecret } from "@/lib/ai-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polls a background job's status from the Python bridge.
 *
 * Server Actions call `GET /api/ai/jobs/{jobId}` which forwards to the bridge's
 * `GET /api/jobs/{jobId}` (authenticated via `X-Bridge-Secret`), returning
 * `{ job_id, status, result, error }` for progress polling.
 */
export async function GET(
  _request: Request,
  { params }: { params: { jobId: string } },
): Promise<Response> {
  const jobId = params.jobId;
  if (!/^[0-9a-f]{32}$/.test(jobId)) {
    return new Response(
      JSON.stringify({ detail: "Invalid job_id." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const secret = bridgeSecret();
  try {
    const upstream = await fetch(`${bridgeUrl()}/api/jobs/${jobId}`, {
      headers: secret ? { "X-Bridge-Secret": secret } : {},
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ detail: "AI bridge unreachable." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
