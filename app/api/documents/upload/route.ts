import { getRbacContext, rbacErrorResponse } from "@/lib/rbac";
import { DocumentError, uploadDocument } from "@/lib/storage/documents";
import { withHttpMetrics } from "@/lib/observability/metrics";
import { captureException } from "@/lib/observability/errors";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST multipart/form-data { file, ownerType, ownerId? }
 *
 * Tenant, actor and role come exclusively from the canonical RBAC context;
 * nothing in the form can select a tenant. The pipeline quarantines, scans,
 * and only returns a record when the scanner said CLEAN.
 */
export async function POST(request: Request): Promise<Response> {
  return withHttpMetrics(request, async () => {
    const requestId = request.headers.get("x-request-id");
    let ctx;
    try {
      ctx = await getRbacContext();
    } catch (error) {
      return rbacErrorResponse(error) ?? Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
      return Response.json({ ok: false, code: "TOO_LARGE", error: "Upload too large." }, { status: 413 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ ok: false, code: "INVALID_METADATA", error: "Expected multipart/form-data." }, { status: 400 });
    }
    const file = form.get("file");
    const ownerType = String(form.get("ownerType") ?? "");
    const ownerIdRaw = form.get("ownerId");
    const ownerId = typeof ownerIdRaw === "string" && /^[0-9a-f-]{36}$/i.test(ownerIdRaw) ? ownerIdRaw : null;
    if (!(file instanceof File) || !["candidate", "employee", "company"].includes(ownerType)) {
      return Response.json({ ok: false, code: "INVALID_METADATA", error: "file and ownerType are required." }, { status: 400 });
    }
    if (ownerType !== "company" && !ownerId) {
      return Response.json({ ok: false, code: "INVALID_METADATA", error: "ownerId is required for candidate/employee documents." }, { status: 400 });
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const record = await uploadDocument(ctx, { name: file.name, declaredMime: file.type, bytes, ownerType: ownerType as "candidate" | "employee" | "company", ownerId }, requestId);
      return Response.json({ ok: true, data: { id: record.id, name: record.originalName, status: record.status, contentType: record.contentType, sizeBytes: record.sizeBytes, sha256: record.sha256 } }, { status: 201 });
    } catch (error) {
      if (error instanceof DocumentError) {
        return Response.json({ ok: false, code: error.code, error: error.message, retryable: error.retryable }, { status: error.status, headers: error.retryable ? { "Retry-After": "30" } : undefined });
      }
      await captureException(error, { requestId, route: "/api/documents/upload", organizationId: ctx.organizationId, userId: ctx.user.id });
      return Response.json({ ok: false, code: "INTERNAL", error: "Upload failed." }, { status: 500 });
    }
  });
}
