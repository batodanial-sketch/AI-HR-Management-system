import "server-only";

/**
 * Server-side bridge integration: emits domain events to the Python AI bridge
 * so workflow triggers fire (e.g. ``employee.created`` → welcome e-mail).
 *
 * Emission is fire-and-forget: the primary server action must never fail just
 * because the bridge is offline, so errors are swallowed after a short timeout.
 */

const DEFAULT_BRIDGE_URL = "http://localhost:8000";

export async function emitWorkflowEvent(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = `${process.env.AI_BRIDGE_URL ?? DEFAULT_BRIDGE_URL}/api/workflows/trigger`;
  const secret = process.env.BRIDGE_SECRET_KEY ?? "";
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Bridge-Secret": secret } : {}),
      },
      body: JSON.stringify({ event, payload }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Fire-and-forget — the workflow run is best-effort.
  }
}
