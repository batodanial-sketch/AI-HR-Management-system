import "server-only";
import type { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";

/**
 * Shared CRUD plumbing for the extended HR module API routes
 * (`/api/benefits`, `/api/equity`, `/api/expenses`, `/api/surveys`,
 * `/api/planning`, `/api/contractors`, `/api/offboarding`, `/api/assets`,
 * `/api/documents`, `/api/screening`).
 *
 * Every handler:
 *  - validates input with a Zod schema (400 on failure)
 *  - resolves the caller's organization from the Supabase session (401)
 *  - writes through the RLS-bound server client, so tenant isolation is
 *    enforced by the database even if this layer misbehaves
 *  - degrades cleanly in demo mode (503 with a clear message — writes are
 *    disabled when Supabase is unconfigured)
 */

export function moduleError(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

/** Lists module rows via a domain getter (which includes seed fallback). */
export async function handleModuleList<T>(
  loader: () => Promise<T[]>,
): Promise<Response> {
  try {
    const data = await loader();
    return Response.json({ ok: true, data, count: data.length });
  } catch (error) {
    return moduleError(
      error instanceof Error ? error.message : "Unable to load module data.",
      500,
    );
  }
}

export interface ModuleContext {
  organizationId: string;
  userId: string;
}

/** Resolves the caller's organization + user context, or null (401). */
export async function moduleContext(): Promise<ModuleContext | null> {
  try {
    const user = await getCurrentUser();
    if (!user.organizationId) return null;
    return { organizationId: user.organizationId, userId: user.id };
  } catch {
    return null;
  }
}

type CreateRowMapper<P> = (
  parsed: P,
  ctx: ModuleContext,
) => Record<string, unknown>;

/**
 * Validates + inserts a module row. `schema` is the Zod validator, `toRow`
 * maps the parsed payload to the canonical snake_case row (without
 * `organization_id`, which is attached here).
 */
export async function handleModuleCreate<P>(
  table: string,
  schema: z.ZodType<P>,
  input: unknown,
  toRow: CreateRowMapper<P>,
): Promise<Response> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join(" · ");
    return moduleError(`Validation failed — ${details}`, 400);
  }
  if (!hasSupabaseEnv()) {
    return moduleError(
      "Supabase is not configured — writes are disabled in demo mode.",
      503,
    );
  }
  const ctx = await moduleContext();
  if (!ctx) {
    return moduleError("Unauthorized — no organization context.", 401);
  }
  try {
    const { data, error } = await serverClient()
      .from(table as never)
      .insert({
        organization_id: ctx.organizationId,
        ...toRow(parsed.data, ctx),
      } as never)
      .select()
      .single();
    if (error) {
      return moduleError(`Write failed: ${error.message}`, 409);
    }
    return Response.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return moduleError(
      error instanceof Error ? error.message : "Write failed.",
      500,
    );
  }
}
