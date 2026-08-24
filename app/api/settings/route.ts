import { NextResponse } from "next/server";
import { readSettings, writeSettings, type AppSettings } from "@/lib/settings/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KEYS = new Set([
  "appearance",
  "ai",
  "memory",
  "branding",
] as const);

function sanitizePatch(body: unknown): Partial<AppSettings> {
  const patch: Partial<AppSettings> = {};
  if (typeof body !== "object" || body === null) {
    return patch;
  }
  const record = body as Record<string, unknown>;
  for (const key of ALLOWED_KEYS) {
    if (key in record && typeof record[key] === "object" && record[key] !== null) {
      (patch as Record<string, unknown>)[key] = record[key];
    }
  }
  return patch;
}

export async function GET(): Promise<NextResponse> {
  const settings = await readSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const patch = sanitizePatch(body);
  const settings = await writeSettings(patch);
  return NextResponse.json(settings);
}
