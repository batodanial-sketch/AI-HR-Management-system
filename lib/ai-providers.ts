/**
 * Shared AI provider catalog (client-safe mirror of `bridge/providers`).
 *
 * Kept in lock-step with `bridge/providers/__init__.py` so the Next.js layer
 * can pre-validate model names and normalize custom OpenAI-compatible
 * endpoints before forwarding to the Python bridge. Import-safe in both
 * server and client bundles — no secrets live here.
 */

/** Groq model names accepted by Groq's OpenAI-compatible API. */
export const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.2-3b-preview",
  "llama-3.2-11b-vision-preview",
  "mixtral-8x7b-32768",
  "deepseek-r1-distill-llama-70b",
  "qwen-2.5-32b",
  "gemma2-9b-it",
  "openai/gpt-oss-120b",
] as const;

/** Human-friendly aliases mapped to canonical Groq model ids. */
export const MODEL_ALIASES: Record<string, string> = {
  "mixtral-8x7b-instruct": "mixtral-8x7b-32768",
  mixtral: "mixtral-8x7b-32768",
  "llama-3.3-70b": "llama-3.3-70b-versatile",
  "deepseek-r1": "deepseek-r1-distill-llama-70b",
  "deepseek-r1-70b": "deepseek-r1-distill-llama-70b",
  "gpt-oss-120b": "openai/gpt-oss-120b",
};

export type ProviderId = "openai" | "groq" | "gemini" | "anthropic" | "custom";

export const PROVIDER_IDS: ProviderId[] = [
  "openai",
  "groq",
  "gemini",
  "anthropic",
  "custom",
];

const GROQ_MODEL_SET = new Set<string>(GROQ_MODELS);

/**
 * Normalizes a Groq model name (alias resolution + case folding). Returns the
 * canonical model id, or null when the name is not in the catalog.
 */
export function normalizeGroqModel(model: string | null | undefined): string | null {
  if (!model) return null;
  const key = model.trim().toLowerCase();
  const canonical = MODEL_ALIASES[key] ?? key;
  return GROQ_MODEL_SET.has(canonical) ? canonical : null;
}

export interface ResolvedModel {
  /** Canonical model id to send to the provider. */
  model: string;
  /** False when an explicitly requested Groq model is unknown. */
  valid: boolean;
  /** Set when an invalid model was replaced by a provider default. */
  fallback?: string;
}

/** Resolves + validates a model for a provider (mirrors the bridge logic). */
export function resolveModel(
  provider: string,
  explicitModel?: string | null,
): ResolvedModel {
  if (!explicitModel) {
    return { model: provider === "groq" ? "openai/gpt-oss-120b" : "default", valid: true };
  }
  const trimmed = explicitModel.trim();
  if (provider === "groq") {
    const canonical = normalizeGroqModel(trimmed);
    if (!canonical) {
      return {
        model: "openai/gpt-oss-120b",
        valid: false,
        fallback: "openai/gpt-oss-120b",
      };
    }
    return { model: canonical, valid: true };
  }
  return { model: trimmed, valid: true };
}

/**
 * Normalizes an OpenAI-compatible base URL:
 *  - strips trailing slashes and an accidental trailing `/chat/completions`
 *  - appends `/v1` for custom endpoints that only supply a bare host
 */
export function normalizeCustomBaseUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) {
    base = base.slice(0, -"/chat/completions".length).replace(/\/+$/, "");
  }
  if (base && !base.includes("/v1") && !base.endsWith("/v1")) {
    base = `${base}/v1`;
  }
  return base;
}

/** The chat-completions URL a provider will actually be called at. */
export function chatCompletionsEndpoint(baseUrl: string): string {
  return `${normalizeCustomBaseUrl(baseUrl)}/chat/completions`;
}

/** Validates a custom base URL, returning a normalized value or null. */
export function parseCustomBaseUrl(raw: string): string | null {
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    // http is permitted for self-hosted/localhost endpoints; https for the
    // public internet. Anything else (ftp:, file:, …) is rejected.
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return normalizeCustomBaseUrl(url.toString());
  } catch {
    return null;
  }
}
