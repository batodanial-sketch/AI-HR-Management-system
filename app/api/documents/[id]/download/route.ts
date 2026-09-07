import { getRbacContext, rbacErrorResponse } from "@/lib/rbac";
import { DocumentError, documentDownloadUrl } from "@/lib/storage/documents";
import { withHttpMetrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mints a short-lived signed URL after an authorization check. Never a public URL. */
export async function GET(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withHttpMetrics(request, async () => {
    let ctx;
    try {
      ctx = await getRbacContext();
    } catch (error) {
      return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) return Response.json({ ok: false, code: "NOT_FOUND", error: "Document not found." }, { status: 404 });
    try {
      const { url, expiresInSeconds } = await documentDownloadUrl(ctx, params.id, new URL(request.url).origin);
      return Response.json({ ok: true, data: { url, expiresInSeconds } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof DocumentError) return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
      return Response.json({ ok: false, code: "INTERNAL", error: "Download failed." }, { status: 500 });
    }
  });
}
