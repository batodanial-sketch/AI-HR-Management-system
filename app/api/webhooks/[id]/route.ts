import { NextResponse } from "next/server";
import { deleteWebhook } from "@/lib/webhooks";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  await deleteWebhook(id);
  await recordAudit({ action: "webhook.delete", entity: "webhook", entityId: id });
  return NextResponse.json({ ok: true });
}
