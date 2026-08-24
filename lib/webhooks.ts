import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { hasSupabaseEnv, serverClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * Webhook system — subscription registry + signed dispatch.
 *
 * Admins register endpoint URLs + event filters. Domain events (from server
 * actions and the workflow engine) are fanned out to matching subscriptions
 * with an HMAC signature (`X-Fluxentiq-Signature`) so receivers can verify
 * authenticity. Deliveries are recorded for audit.
 */

export type WebhookEvent =
  | "employee.created"
  | "employee.updated"
  | "leave.requested"
  | "leave.resolved"
  | "candidate.moved"
  | "payroll.completed"
  | "workflow.completed";

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}

export interface WebhookDeliveryResult {
  subscriptionId: string;
  event: string;
  ok: boolean;
  statusCode: number | null;
}

function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function listWebhooks(): Promise<WebhookSubscription[]> {
  if (!hasSupabaseEnv()) {
    return [];
  }
  const user = await getCurrentUser();
  if (!user.organizationId) {
    return [];
  }
  const { data, error } = await serverClient()
    .from("webhook_subscriptions")
    .select("*")
    .eq("organization_id", user.organizationId);
  if (error || !data) {
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    url: row.url,
    events: row.events ?? [],
    active: row.active,
  }));
}

export async function createWebhook(input: {
  url: string;
  events: WebhookEvent[];
  secret?: string;
}): Promise<string> {
  const user = await getCurrentUser();
  if (!hasSupabaseEnv() || !user.organizationId) {
    return `wh-${Date.now()}`;
  }
  const { data, error } = await serverClient()
    .from("webhook_subscriptions")
    .insert({
      organization_id: user.organizationId,
      url: input.url,
      events: input.events,
      secret: input.secret ?? null,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Failed to create webhook: ${error.message}`);
  }
  return data.id;
}

export async function deleteWebhook(id: string): Promise<void> {
  if (!hasSupabaseEnv()) {
    return;
  }
  const user = await getCurrentUser();
  if (!user.organizationId) {
    return;
  }
  await serverClient()
    .from("webhook_subscriptions")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organizationId);
}

/** Fans out an event to all matching active subscriptions. */
export async function dispatchWebhooks(
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<WebhookDeliveryResult[]> {
  if (!hasSupabaseEnv()) {
    return [];
  }
  const user = await getCurrentUser();
  if (!user.organizationId) {
    return [];
  }

  const { data, error } = await serverClient()
    .from("webhook_subscriptions")
    .select("*")
    .eq("organization_id", user.organizationId)
    .eq("active", true);
  if (error || !data) {
    return [];
  }

  const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
  const results: WebhookDeliveryResult[] = [];

  for (const sub of data) {
    const events: string[] = sub.events ?? [];
    if (events.length > 0 && !events.includes(event)) {
      continue;
    }
    let ok = false;
    let statusCode: number | null = null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Fluxentiq-Event": event,
      };
      if (sub.secret) {
        headers["X-Fluxentiq-Signature"] = `sha256=${signPayload(sub.secret, body)}`;
      }
      const response = await fetch(sub.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
      statusCode = response.status;
      ok = response.ok;
    } catch {
      ok = false;
    }

    await serverClient()
      .from("webhook_deliveries")
      .insert({
        subscription_id: sub.id,
        event,
        status: ok ? "success" : "failed",
        status_code: statusCode,
      });

    results.push({ subscriptionId: sub.id, event, ok, statusCode });
  }

  return results;
}
