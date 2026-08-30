import { z } from "zod";
import { dispatchWebhooks, verifyDispatchSignature, type WebhookEvent } from "@/lib/webhooks";
import { getRbacContext } from "@/lib/rbac";
import { roleAtLeast } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound event webhook gateway — the dispatch engine for event-driven
 * automation (n8n, Twilio/WhatsApp outreach, lead follow-ups, Slack).
 *
 * POST { event, payload, organizationId? } fans the event out to every
 * active subscription registered for the tenant, signed with
 * `X-Fluxentiq-Signature: sha256=<hmac>` using each subscription's secret.
 * Deliveries are recorded in `webhook_deliveries` for audit/retries.
 *
 * Authentication (either path suffices):
 *  1. Machine-to-machine — HMAC header signed with N8N_WEBHOOK_SECRET
 *     (requires `organizationId` in the body; tenants are never inferred).
 *  2. Session — an authenticated HR_ADMIN/SUPER_ADMIN member of the tenant
 *     (the `organizationId` may be omitted; it resolves from the session).
 */

const WEBHOOK_EVENTS = [
  "employee.created",
  "employee.updated",
  "leave.requested",
  "leave.resolved",
  "candidate.moved",
  "payroll.completed",
  "workflow.completed",
  "expense.created",
  "screening.completed",
  "offboarding.completed",
] as const;

const outboundSchema = z.object({
  event: z.enum(WEBHOOK_EVENTS),
  payload: z.record(z.string(), z.unknown()).default({}),
  organizationId: z.string().uuid().optional().nullable(),
});

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = outboundSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join(" · "),
      },
      { status: 400 },
    );
  }

  // ── Machine-to-machine (HMAC) path ────────────────────────────────
  const secret = process.env.N8N_WEBHOOK_SECRET ?? "";
  const signature = request.headers.get("x-fluxentiq-signature");

  if (secret && signature) {
    if (!verifyDispatchSignature(rawBody, signature, secret)) {
      return Response.json({ ok: false, error: "Invalid HMAC signature." }, { status: 401 });
    }
    if (!parsed.data.organizationId) {
      return Response.json(
        { ok: false, error: "organizationId is required for machine-to-machine broadcasts." },
        { status: 400 },
      );
    }
    const deliveries = await dispatchWebhooks(
      parsed.data.event as WebhookEvent,
      parsed.data.payload,
      parsed.data.organizationId,
    );
    return Response.json(
      { ok: true, event: parsed.data.event, deliveries },
      { status: 202 },
    );
  }

  // ── Session path (HR_ADMIN / SUPER_ADMIN) ────────────────────────
  const ctx = await getRbacContext().catch(() => null);
  if (!ctx) {
    return Response.json({ ok: false, error: "Unauthorized — no session or invalid signature." }, { status: 401 });
  }
  if (!ctx.demoMode && !roleAtLeast(ctx.role, "HR_ADMIN")) {
    return Response.json(
      { ok: false, error: `RBAC: HR_ADMIN role required to broadcast webhook events — the ${ctx.role} role is not authorized.` },
      { status: 403 },
    );
  }
  const organizationId = parsed.data.organizationId ?? ctx.organizationId;
  if (!ctx.demoMode && ctx.organizationId && organizationId !== ctx.organizationId) {
    return Response.json(
      { ok: false, error: "Cannot broadcast events for another organization." },
      { status: 403 },
    );
  }

  const deliveries = await dispatchWebhooks(
    parsed.data.event as WebhookEvent,
    parsed.data.payload,
    organizationId,
  );
  return Response.json(
    { ok: true, event: parsed.data.event, organizationId, deliveries },
    { status: 202 },
  );
}
