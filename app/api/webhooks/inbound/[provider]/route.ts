import { NextRequest } from "next/server";
import {
  INBOUND_EVENTS,
  INBOUND_PROVIDERS,
  processInboundEvent,
  verifyN8n,
  verifyTwilio,
  verifyWhatsApp,
  type InboundEventType,
  type InboundProvider,
  type VerificationResult,
} from "@/lib/webhooks/inbound";
import { adminClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound webhook receiver gateway — `/api/webhooks/inbound/[provider]`.
 *
 * Accepts machine callbacks from n8n, Twilio and WhatsApp (Meta Cloud) with
 * strict signature verification, then routes them to domain processors:
 *
 *   candidate.whatsapp_reply   → WhatsApp candidate replies (auto-advances
 *                                the pipeline stage on positive sentiment)
 *   n8n.workflow_completed     → n8n workflow run completions
 *   screening.external_score   → external AI screening scores
 *
 * Security posture:
 *   - Production: every request MUST carry a valid provider signature; an
 *     unconfigured secret fails closed (503).
 *   - Development: when the secret env var is missing the gateway accepts
 *     unsigned payloads but flags them (`verified: false`) — never in
 *     production builds.
 *   - Every receipt is stored in `inbound_webhook_events` for replay/diagnosis
 *     and every state change lands in `audit_logs` as actor_type SYSTEM.
 */

const jsonError = (message: string, code: string, status: number): Response => {
  return Response.json({ ok: false, error: message, code }, { status });
};

async function recordReceipt(params: {
  provider: string;
  event: string;
  payload: Record<string, unknown>;
  verification: VerificationResult;
  organizationId?: string | null;
}): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const { data, error } = await adminClient()
      .from("inbound_webhook_events")
      .insert({
        organization_id: params.organizationId ?? null,
        provider: params.provider,
        event: params.event,
        payload: params.payload,
        signature_verified: params.verification.ok,
        signature_method: params.verification.ok ? params.verification.method : null,
        processed: false,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return String(data.id);
  } catch {
    return null;
  }
}

async function markProcessed(receiptId: string | null, ok: boolean, error?: string): Promise<void> {
  if (!receiptId || !hasSupabaseEnv()) return;
  try {
    await adminClient()
      .from("inbound_webhook_events")
      .update({ processed: true, ...(ok ? {} : { processing_error: error ?? "processing failed" }) })
      .eq("id", receiptId);
  } catch {
    // Best-effort bookkeeping.
  }
}

function verificationFor(
  provider: InboundProvider,
  request: NextRequest,
  rawBody: string,
): VerificationResult {
  const queryToken = request.nextUrl.searchParams.get("token");
  switch (provider) {
    case "n8n":
      return verifyN8n(
        rawBody,
        request.headers.get("x-fluxentiq-signature") ?? request.headers.get("x-n8n-signature"),
        request.headers.get("authorization")?.startsWith("Bearer ")
          ? request.headers.get("authorization")!.slice("Bearer ".length)
          : null,
        queryToken,
        process.env.N8N_WEBHOOK_SECRET ?? "",
      );
    case "twilio":
      return verifyTwilio(
        rawBody,
        request.headers.get("x-twilio-signature"),
        request.url,
        process.env.TWILIO_AUTH_TOKEN ?? "",
      );
    case "whatsapp":
      return verifyWhatsApp(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        request.headers.get("x-fluxentiq-signature"),
        process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET ?? "",
        process.env.N8N_WEBHOOK_SECRET ?? "",
      );
  }
}

function failClosedUnlessDev(verification: VerificationResult): Response | null {
  if (verification.ok) return null;
  const isProduction = process.env.NODE_ENV === "production";
  const unconfigured = verification.reason?.includes("is not configured");

  if (isProduction || !unconfigured) {
    return jsonError(
      verification.reason ?? "Signature verification failed.",
      isProduction && unconfigured ? "INBOUND_NOT_CONFIGURED" : "INVALID_SIGNATURE",
      isProduction && unconfigured ? 503 : 401,
    );
  }
  // Development-only tolerance: accept unsigned payloads with an explicit flag.
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { provider: string } },
): Promise<Response> {
  const provider = params.provider.toLowerCase();
  if (!INBOUND_PROVIDERS.includes(provider as InboundProvider)) {
    return jsonError(`Unknown provider: ${params.provider}.`, "UNKNOWN_PROVIDER", 404);
  }
  // n8n webhook nodes probe endpoints with GET when testing the connection.
  return Response.json({
    ok: true,
    provider,
    supportedEvents: INBOUND_EVENTS,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } },
): Promise<Response> {
  const provider = params.provider.toLowerCase();
  if (!INBOUND_PROVIDERS.includes(provider as InboundProvider)) {
    return jsonError(`Unknown provider: ${params.provider}.`, "UNKNOWN_PROVIDER", 404);
  }

  const rawBody = await request.text();

  // ── 1. Signature verification (fail closed in production) ──────────────
  const verification = verificationFor(provider as InboundProvider, request, rawBody);
  const devTolerance = verification.ok ? null : failClosedUnlessDev(verification);
  if (devTolerance) return devTolerance;

  // ── 2. Parse + validate the event envelope ─────────────────────────────
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected an object");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError("Request body must be a JSON object.", "INVALID_BODY", 400);
  }

  const event = typeof body.event === "string" ? body.event : null;
  if (!event || !INBOUND_EVENTS.includes(event as InboundEventType)) {
    return jsonError(
      `Unsupported event. Supported: ${INBOUND_EVENTS.join(", ")}.`,
      "UNSUPPORTED_EVENT",
      400,
    );
  }
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

  // ── 3. Persist receipt → process → mark processed ─────────────────────
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : null;
  const receiptId = await recordReceipt({
    provider,
    event,
    payload,
    verification,
    organizationId,
  });

  const result = await processInboundEvent(provider, event as InboundEventType, payload);
  await markProcessed(receiptId, result.ok, result.ok ? undefined : result.message);

  return Response.json(
    {
      ok: result.ok,
      event,
      provider,
      verified: verification.ok || undefined,
      verificationMethod: verification.ok ? verification.method : undefined,
      warning: verification.ok
        ? undefined
        : "Signature verification is disabled in development — configure the provider secret before production.",
      result,
    },
    { status: result.ok ? 200 : 422 },
  );
}
