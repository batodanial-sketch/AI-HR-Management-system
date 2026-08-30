import "server-only";
import { z } from "zod";
import { COPILOT_TOOL_CATALOG, type CopilotToolSpec } from "@/lib/ai-providers";

/**
 * Copilot tool registry + executor (server-only).
 *
 * Each tool maps 1:1 onto an RBAC-guarded CRUD route (`/api/expenses`,
 * `/api/offboarding`, `/api/contractors`, …). Execution performs a
 * cookie-forwarded internal fetch to that route, so the agent inherits the
 * caller's session, role and data scope — a tool can never exceed what the
 * human driving the conversation could do themselves.
 *
 * Write tools are flagged `kind: "write"`; the orchestrator asks the user to
 * confirm those before execution (inline approval cards in the Copilot UI).
 */

export interface ToolExecutionResult {
  ok: boolean;
  tool: string;
  message: string;
  data?: unknown;
  status?: number;
}

interface ToolDefinition {
  spec: CopilotToolSpec;
  method: "GET" | "POST" | "PATCH";
  path: string;
  argSchema: z.ZodTypeAny;
  /** Maps validated args to the request body (undefined = no body). */
  toBody?: (args: Record<string, unknown>) => Record<string, unknown>;
}

const EMPTY_ARGS = z.object({}).default({});

const uuid = z.string().uuid();

const DEFINITIONS: ToolDefinition[] = [
  { spec: byName("fetch_benefits"), method: "GET", path: "/api/benefits", argSchema: EMPTY_ARGS },
  { spec: byName("fetch_equity"), method: "GET", path: "/api/equity", argSchema: EMPTY_ARGS },
  { spec: byName("fetch_expenses"), method: "GET", path: "/api/expenses", argSchema: EMPTY_ARGS },
  {
    spec: byName("create_expense"),
    method: "POST",
    path: "/api/expenses",
    argSchema: z.object({
      employeeId: uuid,
      merchant: z.string().max(200).optional().nullable(),
      expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      category: z.string().min(2).max(80),
      amount: z.number().nonnegative(),
      currencyCode: z.string().length(3).transform((value) => value.toUpperCase()),
    }),
    toBody: (args) => ({ ...args }),
  },
  { spec: byName("fetch_surveys"), method: "GET", path: "/api/surveys", argSchema: EMPTY_ARGS },
  {
    spec: byName("create_survey"),
    method: "POST",
    path: "/api/surveys",
    argSchema: z.object({
      title: z.string().min(2).max(240),
      anonymous: z.boolean().default(true),
    }),
    toBody: (args) => ({ ...args }),
  },
  { spec: byName("fetch_planning"), method: "GET", path: "/api/planning", argSchema: EMPTY_ARGS },
  {
    spec: byName("create_scenario"),
    method: "POST",
    path: "/api/planning",
    argSchema: z.object({
      name: z.string().min(2).max(200),
      headcountForecast: z.number().nonnegative().optional().nullable(),
      budgetForecast: z.number().nonnegative().optional().nullable(),
    }),
    toBody: (args) => ({ ...args }),
  },
  { spec: byName("fetch_contractors"), method: "GET", path: "/api/contractors", argSchema: EMPTY_ARGS },
  {
    spec: byName("create_contractor"),
    method: "POST",
    path: "/api/contractors",
    argSchema: z.object({
      legalName: z.string().min(2).max(240),
      email: z.string().email().max(240),
      currencyCode: z.string().length(3).default("USD"),
    }),
    toBody: (args) => ({ ...args }),
  },
  { spec: byName("fetch_offboarding"), method: "GET", path: "/api/offboarding", argSchema: EMPTY_ARGS },
  {
    spec: byName("approve_offboarding"),
    method: "PATCH",
    path: "/api/offboarding",
    argSchema: z.object({ id: uuid }),
    toBody: (args) => ({ id: args.id, status: "completed" }),
  },
  { spec: byName("fetch_assets"), method: "GET", path: "/api/assets", argSchema: EMPTY_ARGS },
  {
    spec: byName("create_asset"),
    method: "POST",
    path: "/api/assets",
    argSchema: z.object({
      assetTag: z.string().min(2).max(120),
      name: z.string().min(2).max(240),
      category: z.string().min(2).max(120),
    }),
    toBody: (args) => ({ ...args }),
  },
  { spec: byName("fetch_documents"), method: "GET", path: "/api/documents", argSchema: EMPTY_ARGS },
  {
    spec: byName("screen_candidate"),
    method: "POST",
    path: "/api/screening",
    argSchema: z.object({
      candidateId: uuid,
      role: z.string().min(2).max(200),
      score: z.number().min(0).max(100),
      recommendation: z.enum(["advance", "hold", "reject"]),
    }),
    toBody: (args) => ({ ...args }),
  },
  { spec: byName("fetch_team_capacity"), method: "GET", path: "/api/team/capacity", argSchema: EMPTY_ARGS },
];

function byName(name: string): CopilotToolSpec {
  const spec = COPILOT_TOOL_CATALOG.find((tool) => tool.name === name);
  if (!spec) {
    throw new Error(`Copilot tool catalog is missing '${name}'.`);
  }
  return spec;
}

const BY_NAME = new Map(DEFINITIONS.map((definition) => [definition.spec.name, definition]));

/** Tool → target module mapping (used for audit trail attribution). */
export const COPILOT_TOOL_MODULES: Record<string, string> = {
  fetch_benefits: "benefits",
  fetch_equity: "equity",
  fetch_expenses: "expenses",
  create_expense: "expenses",
  fetch_surveys: "surveys",
  create_survey: "surveys",
  fetch_planning: "planning",
  create_scenario: "planning",
  fetch_contractors: "contractors",
  create_contractor: "contractors",
  fetch_offboarding: "offboarding",
  approve_offboarding: "offboarding",
  fetch_assets: "assets",
  create_asset: "assets",
  fetch_documents: "documents",
  screen_candidate: "screening",
  fetch_team_capacity: "team",
};

export function findCopilotTool(name: string): ToolDefinition | null {
  return BY_NAME.get(name) ?? null;
}

export function listToolDefinitions(names?: string[]): ToolDefinition[] {
  if (!names || names.length === 0) return [];
  const allowed = new Set(names);
  return DEFINITIONS.filter((definition) => allowed.has(definition.spec.name));
}

export interface ToolCallContext {
  origin: string;
  cookie: string;
}

/** Validates a planner-emitted tool call against its Zod arg schema. */
export function validateToolArguments(
  definition: ToolDefinition,
  arguments_: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const parsed = definition.argSchema.safeParse(arguments_);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join(" · "),
    };
  }
  return { ok: true, args: (parsed.data ?? {}) as Record<string, unknown> };
}

/**
 * Executes a tool by calling its CRUD route with the caller's session cookie
 * forwarded — the route re-resolves the user and enforces RBAC + tenant
 * scoping exactly as it would for a browser request.
 */
export async function executeCopilotTool(
  definition: ToolDefinition,
  args: Record<string, unknown>,
  context: ToolCallContext,
): Promise<ToolExecutionResult> {
  const headers: Record<string, string> = {};
  if (context.cookie) headers.cookie = context.cookie;
  let body: string | undefined;
  if (definition.method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(definition.toBody ? definition.toBody(args as never) : {});
  }

  let response: Response;
  try {
    response = await fetch(`${context.origin}${definition.path}`, {
      method: definition.method,
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      tool: definition.spec.name,
      message:
        error instanceof Error && error.name === "TimeoutError"
          ? "Tool execution timed out."
          : "Tool execution endpoint was unreachable.",
    };
  }

  let payload: { ok?: boolean; error?: string; data?: unknown; count?: number } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = {};
  }

  if (!response.ok || payload.ok === false) {
    return {
      ok: false,
      tool: definition.spec.name,
      message: payload.error ?? `Tool route returned ${response.status}.`,
      data: payload.data,
      status: response.status,
    };
  }

  const count =
    typeof payload.count === "number"
      ? payload.count
      : Array.isArray(payload.data)
        ? payload.data.length
        : undefined;

  return {
    ok: true,
    tool: definition.spec.name,
    message:
      definition.spec.kind === "write"
        ? `${definition.spec.name} completed successfully.`
        : count !== undefined
          ? `Loaded ${count} record${count === 1 ? "" : "s"} via ${definition.spec.name}.`
          : `${definition.spec.name} completed.`,
    data: payload.data,
    status: response.status,
  };
}
