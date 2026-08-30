import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { adminClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/audit";

/**
 * Inbound webhook receiver — signature verification + payload processors for
 * n8n, Twilio and WhatsApp (Meta Cloud) callbacks.
 *
 * Verification methods per provider:
 *   n8n      → `X-Fluxentiq-Signature` / `X-N8N-Signature` (sha256 HMAC of the
 *              raw body, secret = N8N_WEBHOOK_SECRET), a Bearer token, or the
 *              `?token=` query parameter.
 *   twilio   → `X-Twilio-Signature` (base64 HMAC-SHA1 of the full request URL
 *              + sorted form parameters, secret = TWILIO_AUTH_TOKEN).
 *   whatsapp → `X-Hub-Signature-256` (sha256 HMAC of the raw body, secret =
 *              META_APP_SECRET / WHATSAPP_APP_SECRET); n8n-mediated WhatsApp
 *              callbacks may use `X-Fluxentiq-Signature` instead.
 *
 * Processors map inbound events directly onto domain state:
 *   candidate.whatsapp_reply   → stores the reply + auto-advances the
 *                                candidate's pipeline stage on positive
 *                                sentiment.
 *   n8n.workflow_completed     → syncs workflow run status/output.
 *   screening.external_score   → writes an external AI screening assessment.
 *
 * In demo mode (Supabase unconfigured) processors return a graceful
 * `{ ok: true, demo: true }` result so the gateway stays testable.
 */

export type InboundProvider = "n8n" | "twilio" | "whatsapp";

export type InboundEventType =
  | "candidate.whatsapp_reply"
  | "n8n.workflow_completed"
  | "screening.external_score";

export const INBOUND_PROVIDERS: InboundProvider[] = ["n8n", "twilio", "whatsapp"];

export const INBOUND_EVENTS: InboundEventType[] = [
  "candidate.whatsapp_reply",
  "n8n.workflow_completed",
  "screening.external_score",
];

export interface VerificationResult {
  ok: boolean;
  method: string;
  reason?: string;
}

export interface ProcessResult {
  ok: boolean;
  event: InboundEventType;
  provider: string;
  demo?: boolean;
  message: string;
  data?: Record<string, unknown>;
}

function safeEqual(expected: Buffer, received: Buffer): boolean {
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function hmacSha1Base64(secret: string, value: string): string {
  return createHmac("sha1", secret).update(value).digest("base64");
}

/** `sha256=<hex>` — the convention used by Fluxentiq, n8n and Meta alike. */
export function verifySha256Hex(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const received = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;
  const expected = hmacSha256Hex(secret, rawBody);
  return safeEqual(Buffer.from(expected), Buffer.from(received));
}

/** n8n — HMAC signature, bearer token, or `?token=` query parameter. */
export function verifyN8n(
  rawBody: string,
  signature: string | null,
  bearer: string | null,
  queryToken: string | null,
  secret: string,
): VerificationResult {
  if (!secret) {
    return { ok: false, method: "n8n-hmac", reason: "N8N_WEBHOOK_SECRET is not configured." };
  }
  if (verifySha256Hex(rawBody, signature, secret)) {
    return { ok: true, method: "n8n-hmac" };
  }
  if (bearer && bearer === secret) {
    return { ok: true, method: "n8n-bearer" };
  }
  if (queryToken && queryToken === secret) {
    return { ok: true, method: "n8n-query-token" };
  }
  return { ok: false, method: "n8n-hmac", reason: "Signature verification failed." };
}

/** Twilio — base64 HMAC-SHA1 of the request URL + sorted form parameters. */
export function verifyTwilio(
  rawBody: string,
  signature: string | null,
  requestUrl: string,
  authToken: string,
): VerificationResult {
  if (!authToken) {
    return { ok: false, method: "twilio-hmac-sha1", reason: "TWILIO_AUTH_TOKEN is not configured." };
  }
  if (!signature) {
    return { ok: false, method: "twilio-hmac-sha1", reason: "Missing X-Twilio-Signature." };
  }

  const params: Array<[string, string]> = [];
  if (rawBody.startsWith("{") || rawBody.startsWith("[")) {
    try {
      const json = JSON.parse(rawBody) as Record<string, unknown>;
      for (const [key, value] of Object.entries(json)) {
        if (value !== null && value !== undefined) params.push([key, String(value)]);
      }
    } catch {
      // Fall through to empty params — verification will fail closed.
    }
  } else {
    for (const [key, value] of new URLSearchParams(rawBody)) {
      params.push([key, value]);
    }
  }
  params.sort((a, b) => a[0].localeCompare(b[0]));
  const concatenated = params.map(([, value]) => value).join("");

  const expected = hmacSha1Base64(authToken, `${requestUrl}${concatenated}`);
  return safeEqual(Buffer.from(expected), Buffer.from(signature))
    ? { ok: true, method: "twilio-hmac-sha1" }
    : { ok: false, method: "twilio-hmac-sha1", reason: "Signature verification failed." };
}

/** WhatsApp (Meta Cloud) — X-Hub-Signature-256, or n8n-mediated Fluxentiq HMAC. */
export function verifyWhatsApp(
  rawBody: string,
  hubSignature: string | null,
  fluxentiqSignature: string | null,
  metaSecret: string,
  n8nSecret: string,
): VerificationResult {
  if (hubSignature && metaSecret && verifySha256Hex(rawBody, hubSignature, metaSecret)) {
    return { ok: true, method: "meta-hub-sha256" };
  }
  if (fluxentiqSignature && n8nSecret && verifySha256Hex(rawBody, fluxentiqSignature, n8nSecret)) {
    return { ok: true, method: "fluxentiq-hmac-sha256" };
  }
  if (!metaSecret && !n8nSecret) {
    return {
      ok: false,
      method: "meta-hub-sha256",
      reason: "META_APP_SECRET (or WHATSAPP_APP_SECRET) is not configured.",
    };
  }
  return { ok: false, method: "meta-hub-sha256", reason: "Signature verification failed." };
}

/* ── Payload processors ─────────────────────────────────────────────────── */

const POSITIVE_REPLY_PATTERN =
  /\b(yes|interested|confirm|confirmed|accept|accepted|sure|okay|ok|great|good|definitely|im in|i'm in|available|count me in|proceed|go ahead)\b|👍|✅|🙌/i;
const NEGATIVE_REPLY_PATTERN = /\b(no|not interested|decline|declined|reject|rejected|pass|opt out|opt-out|unsubscribe|stop)\b|👎|❌/i;

export function classifyReplySentiment(body: string): "positive" | "negative" | "neutral" {
  const positive = POSITIVE_REPLY_PATTERN.test(body);
  const negative = NEGATIVE_REPLY_PATTERN.test(body);
  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  return "neutral";
}

const STAGE_ORDER = ["applied", "screening", "interview", "offer", "hired"];

function nextStage(stage: string | null | undefined): string | null {
  if (!stage) return null;
  const index = STAGE_ORDER.indexOf(stage.toLowerCase());
  if (index < 0 || index + 1 >= STAGE_ORDER.length) return null;
  return STAGE_ORDER[index + 1];
}

async function findCandidateOrganization(candidateId: string): Promise<{
  organizationId: string;
  stage: string | null;
} | null> {
  try {
    const { data, error } = await adminClient()
      .from("candidates")
      .select("organization_id, stage")
      .eq("id", candidateId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      organizationId: String(data.organization_id ?? ""),
      stage: typeof data.stage === "string" ? data.stage : null,
    };
  } catch {
    return null;
  }
}

interface ReplyPayload {
  candidateId?: string;
  from?: string;
  body?: string;
  externalId?: string;
  organizationId?: string;
}

/** `candidate.whatsapp_reply` — store the reply; auto-advance on positive. */
async function processWhatsAppReply(payload: ReplyPayload): Promise<ProcessResult> {
  const candidateId = payload.candidateId;
  const body = (payload.body ?? "").trim();
  if (!candidateId || !body) {
    return {
      ok: false,
      event: "candidate.whatsapp_reply",
      provider: "whatsapp",
      message: "candidateId and body are required.",
    };
  }
  if (!hasSupabaseEnv()) {
    const sentiment = classifyReplySentiment(body);
    return {
      ok: true,
      demo: true,
      event: "candidate.whatsapp_reply",
      provider: "whatsapp",
      message:
        sentiment === "positive"
          ? "Demo mode: reply received — stage advancement simulated."
          : "Demo mode: reply stored (no persistence).",
      data: { sentiment, stageAdvanced: sentiment === "positive" },
    };
  }

  const candidate = await findCandidateOrganization(candidateId);
  if (!candidate) {
    return {
      ok: false,
      event: "candidate.whatsapp_reply",
      provider: "whatsapp",
      message: `Candidate ${candidateId} was not found.`,
    };
  }

  const sentiment = classifyReplySentiment(body);

  try {
    const { data: communication, error: commError } = await adminClient()
      .from("candidate_communications")
      .insert({
        organization_id: candidate.organizationId,
        candidate_id: candidateId,
        channel: "whatsapp",
        direction: "inbound",
        body,
        sentiment,
        external_id: payload.externalId ?? null,
        meta: { from: payload.from ?? null },
      })
      .select("id")
      .single();
    if (commError || !communication) {
      throw new Error(commError?.message ?? "Unable to store the reply.");
    }

    let advancedTo: string | null = null;
    if (sentiment === "positive") {
      advancedTo = nextStage(candidate.stage);
      if (advancedTo) {
        const { error: stageError } = await adminClient()
          .from("candidates")
          .update({ stage: advancedTo, updated_at: new Date().toISOString() })
          .eq("id", candidateId)
          .eq("organization_id", candidate.organizationId);
        if (stageError) throw new Error(stageError.message);
      }
    }

    await recordAuditLog(
      {
        actorId: "inbound-webhook",
        actorType: "SYSTEM",
        action: "inbound.candidate.whatsapp_reply",
        targetModule: "recruitment",
        targetId: candidateId,
        changes: {
          sentiment,
          body: body.slice(0, 500),
          stageAdvanced: advancedTo ?? false,
        },
        organizationId: candidate.organizationId,
      },
      { useAdmin: true },
    );

    return {
      ok: true,
      event: "candidate.whatsapp_reply",
      provider: "whatsapp",
      message: advancedTo
        ? `Reply stored (${sentiment}) — candidate advanced to ${advancedTo}.`
        : `Reply stored (${sentiment}).`,
      data: { sentiment, stageAdvanced: Boolean(advancedTo), advancedTo },
    };
  } catch (error) {
    return {
      ok: false,
      event: "candidate.whatsapp_reply",
      provider: "whatsapp",
      message: error instanceof Error ? error.message : "Unable to process the reply.",
    };
  }
}

interface WorkflowPayload {
  runId?: string;
  workflowId?: string;
  status?: string;
  output?: unknown;
  error?: string;
  organizationId?: string;
}

/** `n8n.workflow_completed` — sync run status/output onto the workflow run. */
async function processWorkflowCompleted(payload: WorkflowPayload): Promise<ProcessResult> {
  if (!hasSupabaseEnv()) {
    return {
      ok: true,
      demo: true,
      event: "n8n.workflow_completed",
      provider: "n8n",
      message: "Demo mode: workflow completion acknowledged.",
    };
  }
  if (!payload.runId && !payload.workflowId) {
    return {
      ok: false,
      event: "n8n.workflow_completed",
      provider: "n8n",
      message: "runId or workflowId is required.",
    };
  }

  try {
    let organizationId = payload.organizationId ?? null;
    if (!organizationId && payload.workflowId) {
      const { data } = await adminClient()
        .from("workflows")
        .select("organization_id")
        .eq("id", payload.workflowId)
        .maybeSingle();
      organizationId = data?.organization_id ? String(data.organization_id) : null;
    }

    // Prefer updating an existing run; tolerate creation for new runs.
    const update: Record<string, unknown> = {};
    if (payload.status) update.status = payload.status;
    if (payload.output !== undefined) update.output = payload.output;
    if (payload.error !== undefined) update.error_message = payload.error;
    update.finished_at = new Date().toISOString();

    let upserted = false;
    if (payload.runId) {
      const { error } = await adminClient()
        .from("workflow_runs")
        .update(update)
        .eq("id", payload.runId);
      upserted = !error;
    }
    if (!upserted && payload.workflowId && organizationId) {
      const { error } = await adminClient()
        .from("workflow_runs")
        .insert({
          organization_id: organizationId,
          workflow_id: payload.workflowId,
          status: payload.status ?? "completed",
          output: payload.output ?? null,
          error_message: payload.error ?? null,
          finished_at: new Date().toISOString(),
        });
      if (error) throw new Error(error.message);
    }

    await recordAuditLog(
      {
        actorId: "inbound-webhook",
        actorType: "SYSTEM",
        action: "inbound.n8n.workflow_completed",
        targetModule: "workflows",
        targetId: payload.runId ?? payload.workflowId ?? null,
        changes: { status: payload.status ?? "completed" },
        organizationId,
      },
      { useAdmin: true },
    );

    return {
      ok: true,
      event: "n8n.workflow_completed",
      provider: "n8n",
      message: "Workflow completion recorded.",
      data: { organizationId: organizationId ?? undefined },
    };
  } catch (error) {
    return {
      ok: false,
      event: "n8n.workflow_completed",
      provider: "n8n",
      message: error instanceof Error ? error.message : "Unable to record the workflow completion.",
    };
  }
}

interface ExternalScorePayload {
  candidateId?: string;
  score?: number;
  provider?: string;
  notes?: string;
  recommendation?: string;
  organizationId?: string;
}

/** `screening.external_score` — write an external AI screening assessment. */
async function processExternalScore(payload: ExternalScorePayload): Promise<ProcessResult> {
  const candidateId = payload.candidateId;
  const score = Number(payload.score);
  if (!candidateId || !Number.isFinite(score)) {
    return {
      ok: false,
      event: "screening.external_score",
      provider: "screening",
      message: "candidateId and a numeric score are required.",
    };
  }
  if (!hasSupabaseEnv()) {
    return {
      ok: true,
      demo: true,
      event: "screening.external_score",
      provider: "screening",
      message: "Demo mode: external score accepted (no persistence).",
      data: { score },
    };
  }

  const candidate = await findCandidateOrganization(candidateId);
  if (!candidate) {
    return {
      ok: false,
      event: "screening.external_score",
      provider: "screening",
      message: `Candidate ${candidateId} was not found.`,
    };
  }

  const source = payload.provider ?? "external";
  const recommendation =
    payload.recommendation ?? (score >= 80 ? "advance" : score >= 60 ? "hold" : "reject");

  try {
    const { error } = await adminClient().from("candidate_ai_assessments").insert({
      organization_id: candidate.organizationId,
      candidate_id: candidateId,
      model_provider: `external:${source}`,
      model_name: source,
      prompt_version: "external",
      overall_score: score,
      job_match_score: score,
      recommendation,
      rationale: payload.notes ?? null,
      reviewed_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    await recordAuditLog(
      {
        actorId: "inbound-webhook",
        actorType: "SYSTEM",
        action: "inbound.screening.external_score",
        targetModule: "screening",
        targetId: candidateId,
        changes: { score, recommendation, provider: source },
        organizationId: candidate.organizationId,
      },
      { useAdmin: true },
    );

    return {
      ok: true,
      event: "screening.external_score",
      provider: source,
      message: `External screening score recorded (${score}/100 → ${recommendation}).`,
      data: { score, recommendation },
    };
  } catch (error) {
    return {
      ok: false,
      event: "screening.external_score",
      provider: source,
      message: error instanceof Error ? error.message : "Unable to record the external score.",
    };
  }
}

/** Dispatches an inbound event to its processor. */
export async function processInboundEvent(
  provider: string,
  event: InboundEventType,
  payload: Record<string, unknown>,
): Promise<ProcessResult> {
  switch (event) {
    case "candidate.whatsapp_reply":
      return processWhatsAppReply(payload as ReplyPayload);
    case "n8n.workflow_completed":
      return processWorkflowCompleted(payload as WorkflowPayload);
    case "screening.external_score":
      return processExternalScore(payload as ExternalScorePayload);
    default:
      return { ok: false, event, provider, message: `Unsupported event: ${event}.` };
  }
}
