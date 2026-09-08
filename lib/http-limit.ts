/**
 * Inbound HTTP body-size guard — pure helpers for middleware use.
 *
 * Webhook/integration routes read and buffer raw request bodies before
 * signature verification. A centralized content-length pre-check gives a
 * first line of defense against oversized-payload memory abuse without
 * touching per-route buffering logic.
 */

/** Cap for machine-facing integration bodies (webhooks/desktop/SCIM). */
export const INTEGRATION_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

/**
 * True when the request advertises a content-length above `limit`.
 *
 * Returns false when the header is absent or malformed (streamed/chunked
 * bodies are bounded by the platform/server layer); a *present and valid*
 * oversized length is rejected before any body is buffered.
 */
export function advertisesBodyOverLimit(
  headers: Headers | Record<string, string>,
  limit: number,
): boolean {
  const raw = typeof (headers as Headers).get === "function"
    ? (headers as Headers).get("content-length")
    : (headers as Record<string, string>)["content-length"];
  if (!raw) return false;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > limit;
}
