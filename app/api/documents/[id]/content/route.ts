import { getRbacContext, rbacErrorResponse } from "@/lib/rbac";
import { getDocument, readDocumentBytes } from "@/lib/storage/documents";
import { storageProviderName, verifyLocalAccess } from "@/lib/storage/provider";
import { withHttpMetrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Controlled content endpoint for the LOCAL provider only (Supabase serves
 * its own signed URLs). Requires BOTH a valid session in the same tenant AND
 * a valid, unexpired HMAC signature — the URL alone is never sufficient.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return withHttpMetrics(request, async () => {
    if (storageProviderName() !== "local") return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    let ctx;
    try {
      ctx = await getRbacContext();
    } catch (error) {
      return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const url = new URL(request.url);
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig") ?? "";
    const record = await getDocument(ctx, id);
    if (!record || record.status !== "clean") return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    if (!verifyLocalAccess(record.storageKey, exp, sig)) return Response.json({ ok: false, error: "Link expired or invalid." }, { status: 403 });
    const bytes = await readDocumentBytes(ctx.organizationId, record.storageKey);
    if (!bytes) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    const body = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    body.set(bytes);
    return new Response(body, {
      headers: {
        "Content-Type": record.contentType,
        "Content-Disposition": `attachment; filename="${record.originalName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
