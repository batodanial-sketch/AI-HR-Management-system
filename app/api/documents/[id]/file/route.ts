import { getRbacContext, rbacErrorResponse } from "@/lib/rbac";
import { DocumentError, deleteDocument } from "@/lib/storage/documents";
import { withHttpMetrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withHttpMetrics(request, async () => {
    let ctx;
    try {
      ctx = await getRbacContext();
    } catch (error) {
      return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false, code: "NOT_FOUND", error: "Document not found." }, { status: 404 });
    try {
      await deleteDocument(ctx, id);
      return Response.json({ ok: true });
    } catch (error) {
      if (error instanceof DocumentError) return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
      return Response.json({ ok: false, code: "INTERNAL", error: "Delete failed." }, { status: 500 });
    }
  });
}
