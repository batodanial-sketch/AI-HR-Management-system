import { NextResponse } from "next/server";
import { createWebhook, deleteWebhook, listWebhooks } from "@/lib/webhooks";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const subscriptions = await listWebhooks();
  return NextResponse.json({ subscriptions });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    events?: string[];
    secret?: string;
  };
  if (!body.url) {
    return NextResponse.json({ ok: false, message: "url is required." }, { status: 400 });
  }
  const id = await createWebhook({
    url: body.url,
    events: (body.events ?? []) as never[],
    secret: body.secret,
  });
  await recordAudit({ action: "webhook.create", entity: "webhook", entityId: id });
  return NextResponse.json({ ok: true, id });
}
