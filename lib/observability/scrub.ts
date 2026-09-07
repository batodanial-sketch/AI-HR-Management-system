/**
 * Secret / PII scrubbing shared by metrics, error tracking and logging.
 *
 * Pure and dependency-free so it can run in the Edge runtime and in Jest.
 * Deliberately conservative: anything that *looks* like a credential is
 * replaced, and whole keys that are known to carry secrets are dropped.
 */

const SECRET_KEY_RE =
  /(pass(word|wd)?|secret|token|api[-_]?key|authorization|cookie|set-cookie|session|jwt|private[-_]?key|service[-_]?role|credential|x-bridge-secret|resume(_?text|_?content)?|ssn|national[-_]?id|iban|card[-_]?number)/i;

const SECRET_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED_JWT]"],
  [/\b(sk|gsk|rk|pk|sb|sbp|xoxb|xoxp|ghp|gho|AKIA)[_-]?[A-Za-z0-9]{16,}\b/g, "[REDACTED_KEY]"],
  [/\bsb_(publishable|secret)_[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_KEY]"],
  [/\b[A-Fa-f0-9]{40,}\b/g, "[REDACTED_HEX]"],
  [/(postgres(ql)?|mysql|redis|amqp|mongodb(\+srv)?):\/\/[^\s"']+/gi, "$1://[REDACTED_DSN]"],
  [/https?:\/\/[^\s"'/]*(supabase\.co|groq\.com|openai\.com|anthropic\.com|sentry\.io|upstash\.io)[^\s"']*/gi, "https://[REDACTED_PROVIDER_HOST]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]"],
];

export function scrubString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SECRET_VALUE_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return scrubString(value.length > 2000 ? `${value.slice(0, 2000)}…` : value);
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = scrubValue(v, depth + 1);
  }
  return out;
}

/** Headers safe to attach to telemetry (allowlist, never the full set). */
export function scrubHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const allow = ["content-type", "user-agent", "x-request-id", "x-forwarded-proto", "accept"];
  const out: Record<string, string> = {};
  const get = (k: string) => (headers instanceof Headers ? headers.get(k) : headers[k]);
  for (const key of allow) {
    const v = get(key);
    if (v) out[key] = scrubString(v).slice(0, 200);
  }
  return out;
}

/** Stable, non-reversible identifier for tenants/users in telemetry. */
export function minimizeId(id: string | null | undefined): string | null {
  if (!id) return null;
  // First 8 chars of a UUID are enough to correlate without exposing the key.
  return `${id.slice(0, 8)}…`;
}
