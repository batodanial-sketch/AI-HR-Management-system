import { NextResponse } from "next/server";
import { getLicenseState } from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const license = await getLicenseState();
  return NextResponse.json({
    activated: license !== null,
    license,
  });
}
