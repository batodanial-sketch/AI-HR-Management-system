import { z } from "zod";
import { bridgeSecret, bridgeUrl } from "@/lib/ai-proxy";
import {
  GROQ_MODELS,
  PROVIDER_IDS,
  parseCustomBaseUrl,
  resolveModel,
} from "@/lib/ai-providers";
import { getLicenseState } from "@/lib/license";
import { readSettings } from "@/lib/settings/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testConnectionSchema = z.object({
  provider: z.enum(PROVIDER_IDS as unknown as [string, ...string[]]).optional(),
  model: z.string().min(1).max(200).optional(),
  baseUrl: z.string().min(1).max(400).optional(),
});

/**
 * AI provider connection test.
 *
 * Validates the requested provider/model/endpoint BEFORE forwarding to the
 * Python bridge:
 *  - Groq models are checked against the catalog (aliases like
 *    `mixtral-8x7b-instruct` map to `mixtral-8x7b-32768`).
 *  - Custom OpenAI-compatible base URLs are normalized to `/v1/chat/completions`
 *    (bare hosts get `/v1` appended).
 * The bridge then performs a real minimal completion and reports the model +
 * endpoint it connected to. API keys are always resolved server-side — never
 * accepted from the request body.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be valid JSON.", code: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const parsed = testConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues.map((issue) => issue.message).join(" "),
        code: "INVALID_REQUEST",
      },
      { status: 400 },
    );
  }

  // Effective configuration: request overrides > stored settings > defaults.
  let stored: { provider: string; model: string; baseUrl: string } = {
    provider: "groq",
    model: "",
    baseUrl: "",
  };
  try {
    const settings = await readSettings();
    stored = {
      provider: settings.ai.provider || "groq",
      model: settings.ai.model || "",
      baseUrl: settings.ai.baseUrl || "",
    };
  } catch {
    // Settings file unavailable — fall back to env-driven defaults.
  }

  const provider = (parsed.data.provider ?? stored.provider).toLowerCase();
  const model = parsed.data.model ?? stored.model ?? undefined;
  const rawBaseUrl = parsed.data.baseUrl ?? stored.baseUrl ?? undefined;

  if (!PROVIDER_IDS.includes(provider as never)) {
    return Response.json(
      {
        ok: false,
        error: `Unsupported provider '${provider}'. Use one of: ${PROVIDER_IDS.join(", ")}.`,
        code: "INVALID_PROVIDER",
      },
      { status: 400 },
    );
  }

  // Model validation (strict for explicit requests on Groq).
  if (provider === "groq") {
    const resolved = resolveModel("groq", model);
    if (model && !resolved.valid) {
      return Response.json(
        {
          ok: false,
          error: `Unknown Groq model "${model}". Valid models: ${GROQ_MODELS.join(", ")}.`,
          code: "INVALID_MODEL",
          groqModels: GROQ_MODELS,
        },
        { status: 400 },
      );
    }
  }

  // Custom endpoint normalization.
  let normalizedBaseUrl: string | null = null;
  if (provider === "custom" && rawBaseUrl) {
    normalizedBaseUrl = parseCustomBaseUrl(rawBaseUrl);
    if (!normalizedBaseUrl) {
      return Response.json(
        {
          ok: false,
          error: `Invalid custom base URL "${rawBaseUrl}". Expected an OpenAI-compatible host, e.g. https://host/v1.`,
          code: "INVALID_BASE_URL",
        },
        { status: 400 },
      );
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = bridgeSecret();
  if (secret) headers["X-Bridge-Secret"] = secret;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${bridgeUrl()}/api/ai/test`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider: provider === stored.provider && !parsed.data.provider ? undefined : provider,
        model: model || undefined,
        baseUrl: normalizedBaseUrl ?? undefined,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "Connection test timed out after 20s."
        : `AI bridge unreachable at ${bridgeUrl()}.`;
    return Response.json(
      { ok: false, error: message, code: "BRIDGE_UNREACHABLE" },
      { status: 502 },
    );
  }

  let result: {
    ok?: boolean;
    provider?: string;
    model?: string;
    endpoint?: string;
    message?: string;
  };
  try {
    result = (await upstreamResponse.json()) as typeof result;
  } catch {
    result = {};
  }

  if (!upstreamResponse.ok || !result.ok) {
    return Response.json(
      {
        ok: false,
        error: result.message || `Provider test failed with status ${upstreamResponse.status}.`,
        code: upstreamResponse.status === 400 ? "INVALID_MODEL" : "PROVIDER_ERROR",
      },
      { status: upstreamResponse.status === 400 ? 400 : 502 },
    );
  }

  let tier: string | null = null;
  try {
    tier = (await getLicenseState())?.tier ?? null;
  } catch {
    tier = null;
  }

  return Response.json({
    ok: true,
    provider: result.provider ?? provider,
    model: result.model ?? model ?? null,
    endpoint: result.endpoint ?? null,
    message: result.message ?? "Connected.",
    tier,
  });
}
