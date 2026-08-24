import { NextResponse } from "next/server";
import { deleteWebhook } from "@/lib/webhooks";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  await deleteWebhook(params.id);
  await recordAudit({ action: "webhook.delete", entity: "webhook", entityId: params.id });
  return NextResponse.json({ ok: true });
}
