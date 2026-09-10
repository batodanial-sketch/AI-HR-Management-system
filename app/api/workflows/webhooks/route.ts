import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { adminClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { serviceWorkflowStore } from "@/lib/workflows/store";
import { runIdempotencyKey, webhookDeliveryKey } from "@/lib/workflows/idempotency";
import { SYSTEM_ACTOR, driveRun } from "@/lib/workflows/executor";
import { systemDeps } from "@/lib/workflows/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Workflow event webhooks — verified machine callbacks that start runs.
 *
 * Mirrors the inbound gateway (`/api/webhooks/inbound/[provider]`) posture:
 * HMAC-SHA256 verification, fail-closed 503 when the secret is
 * unconfigured, receipts in `inbound_webhook_events`.
 *
 * Tenancy is resolved from business keys (employee/candidate/… id → owning
 * org via service-role lookup) — the payload's org is NEVER trusted. Each
 * matched active workflow gets exactly one run per delivery
 * (idempotency key = org + event + delivery fingerprint); redeliveries
 * collapse onto the existing run without re-driving it. Runs start under
 * the system actor with sessionless-safe steps only (condition / notify /
 * approval / wait / end); `tool_call` steps wait for a human resume.
 */

const WORKFLOW_EVENTS = ["employee.created", "leave.requested", "candidate.advanced", "payroll.completed"] as const;
type WorkflowEvent = (typeof WORKFLOW_EVENTS)[number];

/** Max workflows driven per delivery (bound; overflow is reported, not silent). */
const MAX_WORKFLOWS_PER_DELIVERY = 25;

const bodySchema = z.object({
  event: z.enum(WORKFLOW_EVENTS),
  deliveryId: z.string().trim().min(1).max(200).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

/** Business key → owning org per event (service-role lookups, ids only). */
async function resolveOrganization(event: WorkflowEvent, payload: Record<string, unknown>): Promise<string | null> {
  const db = adminClient();
  const idOf = (key: string): string | null => {
    const value = payload[key];
    return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  };
  const orgOf = async (table: string, id: string | null): Promise<string | null> => {
    if (!id) return null;
    const { data } = await db.from(table).select("organization_id").eq("id", id).maybeSingle();
    const org = (data as unknown as { organization_id?: unknown } | null)?.organization_id;
    return typeof org === "string" ? org : null;
  };
  switch (event) {
    case "employee.created":
      return orgOf("employees", idOf("employee_id"));
    case "leave.requested":
      return orgOf("leave_requests", idOf("leave_request_id"));
    case "candidate.advanced":
      return orgOf("candidates", idOf("candidate_id"));
    case "payroll.completed":
      return orgOf("payroll_runs", idOf("payroll_run_id"));
  }
}

async function recordReceipt(input: { event: string; payload: Record<string, unknown>; organizationId: string | null; verified: boolean }): Promise<string | null> {
  try {
    const { data, error } = await adminClient()
      .from("inbound_webhook_events")
      .insert({
        organization_id: input.organizationId,
        provider: "workflow",
        event: input.event,
        payload: input.payload,
        signature_verified: input.verified,
        signature_method: input.verified ? "hmac-sha256" : null,
        processed: false,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return String((data as unknown as { id: unknown }).id);
  } catch {
    return null;
  }
}

async function markProcessed(receiptId: string | null, ok: boolean, error?: string): Promise<void> {
  if (!receiptId) return;
  try {
    await adminClient()
      .from("inbound_webhook_events")
      .update({ processed: true, ...(ok ? {} : { processing_error: error ?? "processing failed" }) })
      .eq("id", receiptId);
  } catch {
    // Best-effort bookkeeping.
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ ok: true, provider: "workflow", supportedEvents: [...WORKFLOW_EVENTS] });
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.WORKFLOW_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "Workflow webhooks are not configured.", code: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  }
  const raw = await request.text();
  const signature = request.headers.get("x-fluxentiq-workflow-signature") ?? "";
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return Response.json({ ok: false, error: "Invalid webhook signature.", code: "INVALID_SIGNATURE" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body.", code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Unsupported event or malformed body.", code: "INVALID_BODY" }, { status: 400 });
  }
  if (!hasSupabaseEnv()) {
    return Response.json({ ok: false, error: "Workflow engine unavailable: database is not configured.", code: "ENGINE_UNAVAILABLE" }, { status: 503 });
  }

  const { event, payload } = parsed.data;
  const organizationId = await resolveOrganization(event, payload);
  const receiptId = await recordReceipt({ event, payload, organizationId, verified: true });
  if (!organizationId) {
    await markProcessed(receiptId, false, "business key missing or unresolvable");
    return Response.json({ ok: true, processed: 0, reason: "No owning organization resolved from the event payload." }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const store = serviceWorkflowStore(organizationId);
    const { rows } = await store.listWorkflows(organizationId, { status: "active", limit: 100 });
    const matched = rows.filter((workflow) => workflow.triggerEvent === event).slice(0, MAX_WORKFLOWS_PER_DELIVERY);
    const truncated = rows.filter((workflow) => workflow.triggerEvent === event).length > matched.length;
    const fingerprint =
      request.headers.get("x-fluxentiq-delivery-id")?.trim() ||
      parsed.data.deliveryId ||
      createHash("sha256").update(raw).digest("hex");
    const results: { workflowId: string; runId: string; created: boolean; outcome: string }[] = [];
    for (const workflow of matched) {
      const latest = await store.getLatestVersion(organizationId, workflow.id);
      if (!latest) continue;
      const { run, created } = await store.createRun({
        organizationId,
        workflowId: workflow.id,
        workflowVersion: latest.version,
        idempotencyKey: runIdempotencyKey({
          organizationId,
          workflowId: workflow.id,
          workflowVersion: latest.version,
          stableInput: webhookDeliveryKey({ organizationId, event, deliveryFingerprint: fingerprint }),
        }),
        triggerPayload: { event, ...payload },
        initiatedBy: null,
      });
      let outcome = "deduped";
      if (created) {
        const drive = await driveRun(systemDeps(organizationId), organizationId, run.id, { userId: SYSTEM_ACTOR, role: "HR_ADMIN", organizationId });
        outcome = drive.outcome;
      }
      results.push({ workflowId: workflow.id, runId: run.id, created, outcome });
    }
    await markProcessed(receiptId, true);
    return Response.json({ ok: true, processed: results.length, truncated, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await markProcessed(receiptId, false, error instanceof Error ? error.message : "processing failed");
    return Response.json({ ok: false, error: "Webhook processing failed." }, { status: 500 });
  }
}
