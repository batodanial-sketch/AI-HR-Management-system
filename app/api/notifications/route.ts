import { NextResponse } from "next/server";
import { getNotifications, markAllNotificationsRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const notifications = await getNotifications();
  return NextResponse.json({ notifications });
}

export async function POST(): Promise<NextResponse> {
  await markAllNotificationsRead();
  return NextResponse.json({ ok: true });
}
