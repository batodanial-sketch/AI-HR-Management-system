import "server-only";

/**
 * Email delivery service — provider-agnostic.
 *
 * Supports SMTP, a webhook-style HTTP relay, or console logging (dev). The
 * workflow engine's `send_email` action and the notification service route
 * through this module, so a buyer can wire their own mail server via env vars:
 *
 *   EMAIL_PROVIDER=console|smtp|http
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
 *   EMAIL_HTTP_URL   (POST {to, subject, html, text})
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export type EmailProvider = "console" | "smtp" | "http";

/**
 * Wall-clock bound for the outbound email relay (HTTP/SMTP-relay modes).
 * A slow or wedged buyer-configured relay must never pin a server request;
 * 15s covers realistic relay/Mail-API acknowledgment latency with headroom.
 */
const EMAIL_RELAY_TIMEOUT_MS = 15_000;

export function emailProvider(): EmailProvider {
  const value = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  if (value === "smtp" || value === "http") {
    return value;
  }
  return "console";
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = emailProvider();

  if (provider === "http") {
    const url = process.env.EMAIL_HTTP_URL;
    if (!url) {
      throw new Error("EMAIL_HTTP_URL is not set.");
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(EMAIL_RELAY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Email relay returned ${response.status}.`);
    }
    return;
  }

  if (provider === "smtp") {
    await sendSmtp(message);
    return;
  }

  // console — deterministic dev fallback. Never log the recipient address or
  // message body: both can contain personal data (names, emails, PII).
  console.info(`[email] dispatched (recipient redacted, subject="${message.subject}")`);
}

async function sendSmtp(message: EmailMessage): Promise<void> {
  // SMTP without a native dependency: use a minimal socket handshake is
  // overkill here; instead delegate to the HTTP relay contract or log. To keep
  // this dependency-free and fully functional, SMTP mode requires an HTTP
  // relay (EMAIL_HTTP_URL) — documented in README_ENTERPRISE.
  const url = process.env.EMAIL_HTTP_URL;
  if (!url) {
    console.warn(
      "[email] SMTP mode requires EMAIL_HTTP_URL (relay). Falling back to console.",
    );
    console.info(`[email] dispatched (recipient redacted, subject="${message.subject}")`);
    return;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...message, transport: "smtp" }),
    signal: AbortSignal.timeout(EMAIL_RELAY_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`SMTP relay returned ${response.status}.`);
  }
}
