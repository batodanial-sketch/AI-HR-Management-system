import { NextResponse } from "next/server";
import { buildAdapter } from "@/lib/memory/factory";
import type { MemoryProvider, MemoryTestResult } from "@/lib/memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestRequestBody {
  provider?: MemoryProvider;
  connection?: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    sqlitePath?: string;
    customBaseUrl?: string;
    customApiKey?: string;
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as TestRequestBody;
  const provider = body.provider ?? "supabase";
  const connection = body.connection ?? {};

  try {
    const adapter = buildAdapter(provider, connection);
    const result: MemoryTestResult = await adapter.testConnection();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : "Test failed.",
    } satisfies MemoryTestResult);
  }
}
