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

/* ------------------------------------------------------------------ */
/* Function calling (Copilot tools)                                   */
/* ------------------------------------------------------------------ */

/** JSON-Schema-style tool parameter specification (subset used by the bridge). */
export interface ToolParameterSpec {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

/** A tool the Copilot planner can call (client-safe catalog entry). */
export interface CopilotToolSpec {
  name: string;
  description: string;
  /** read = fetches data; write = mutates state (requires confirmation). */
  kind: "read" | "write";
  parameters: ToolParameterSpec;
}

/** A tool call emitted by the planner. */
export interface CopilotToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Client-safe catalog of Copilot tools. Descriptions drive the bridge's
 * planner prompt; `kind` drives the confirmation UX (write tools render
 * inline approval cards before execution). The server-side executor lives in
 * `lib/copilot/tools.ts` (server-only) and maps each tool to its CRUD route.
 */
export const COPILOT_TOOL_CATALOG: CopilotToolSpec[] = [
  {
    name: "fetch_benefits",
    description: "List the organization's benefit plans.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "fetch_equity",
    description: "List equity grants across the organization.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "fetch_expenses",
    description: "List expense reports the caller may access.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_expense",
    description:
      "Submit an expense report for an employee (amount, category, merchant).",
    kind: "write",
    parameters: {
      type: "object",
      properties: {
        employeeId: { type: "string", description: "UUID of the employee" },
        merchant: { type: "string", description: "Merchant or vendor name" },
        expenseDate: { type: "string", description: "ISO date YYYY-MM-DD" },
        category: { type: "string", description: "Expense category" },
        amount: { type: "number", description: "Amount (>= 0)" },
        currencyCode: { type: "string", description: "ISO 4217 code, e.g. USD" },
      },
      required: ["employeeId", "expenseDate", "category", "amount", "currencyCode"],
    },
  },
  {
    name: "fetch_surveys",
    description: "List pulse surveys.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_survey",
    description: "Create a pulse survey.",
    kind: "write",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        anonymous: { type: "boolean" },
      },
      required: ["title"],
    },
  },
  {
    name: "fetch_planning",
    description: "List workforce planning scenarios.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_scenario",
    description: "Create a workforce planning scenario with headcount/budget forecasts.",
    kind: "write",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        headcountForecast: { type: "number" },
        budgetForecast: { type: "number" },
      },
      required: ["name"],
    },
  },
  {
    name: "fetch_contractors",
    description: "List contractor invoices.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_contractor",
    description: "Register a contractor (legal name + email).",
    kind: "write",
    parameters: {
      type: "object",
      properties: {
        legalName: { type: "string" },
        email: { type: "string" },
        currencyCode: { type: "string" },
      },
      required: ["legalName", "email"],
    },
  },
  {
    name: "fetch_offboarding",
    description: "List offboarding cases the caller may access.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "approve_offboarding",
    description:
      "Approve (complete) an offboarding case by id — finalizes the exit workflow.",
    kind: "write",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID of the offboarding case" },
      },
      required: ["id"],
    },
  },
  {
    name: "fetch_assets",
    description: "List assets the caller may access (assigned assets for staff).",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_asset",
    description: "Register an asset in the organization's inventory.",
    kind: "write",
    parameters: {
      type: "object",
      properties: {
        assetTag: { type: "string" },
        name: { type: "string" },
        category: { type: "string" },
      },
      required: ["assetTag", "name", "category"],
    },
  },
  {
    name: "fetch_documents",
    description: "List the organization's documents.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "screen_candidate",
    description:
      "Record an AI screening result for a candidate (score + recommendation).",
    kind: "write",
    parameters: {
      type: "object",
      properties: {
        candidateId: { type: "string", description: "UUID of the candidate" },
        role: { type: "string" },
        score: { type: "number", description: "0–100" },
        recommendation: { type: "string", description: "advance | hold | reject" },
      },
      required: ["candidateId", "role", "score", "recommendation"],
    },
  },
  {
    name: "fetch_team_capacity",
    description: "Report current license seat usage and availability.",
    kind: "read",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export const COPILOT_TOOL_NAMES = COPILOT_TOOL_CATALOG.map((tool) => tool.name);

/** Builds the bridge-facing tool spec list (excludes the client-only fields). */
export function toolSpecsForBridge(
  names: string[],
): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
  const allowed = new Set(names);
  return COPILOT_TOOL_CATALOG.filter((tool) => allowed.has(tool.name)).map(
    (tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    }),
  );
}
