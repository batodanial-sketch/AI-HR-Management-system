/**
 * Agent policies — which tools each named agent may wield.
 *
 * Policies can only NARROW the catalog: every policy tool must exist in
 * COPILOT_TOOL_CATALOG (pinned by test), and execution still inherits the
 * caller's RBAC through the cookie-forwarded route calls. Narrowing is the
 * point: the intelligence agent cannot touch writes at all, and the
 * recruitment agent's only write is the proposal-gated candidate screen.
 */

import { COPILOT_TOOL_CATALOG } from "@/lib/ai-providers";
import type { AgentId } from "./router";

export interface AgentPolicy {
  /** Stable agent id. */
  id: AgentId;
  /** One-line remit (shown in UI + docs). */
  description: string;
  /** Allowed tool names — always a subset of the catalog. */
  tools: string[];
  /**
   * Planner hint prepended to the agent's first turn. Advisory text only —
   * enforcement stays in code (policy intersection + RBAC + proposals).
   */
  systemHint: string;
}

const CATALOG_NAMES = new Set(COPILOT_TOOL_CATALOG.map((t) => t.name));

function definePolicy(policy: AgentPolicy): AgentPolicy {
  const unknown = policy.tools.filter((t) => !CATALOG_NAMES.has(t));
  if (unknown.length > 0) {
    throw new Error(`Agent policy '${policy.id}' references unknown tools: ${unknown.join(", ")}`);
  }
  return policy;
}

export const AGENT_POLICIES: Record<AgentId, AgentPolicy> = {
  intelligence: definePolicy({
    id: "intelligence",
    description: "Workforce intelligence: insights, briefings, trends, anomalies. Read-only.",
    tools: [
      "get_workforce_insights",
      "get_hr_briefing",
      "search_knowledge",
      "fetch_expenses",
      "fetch_surveys",
      "fetch_planning",
      "fetch_documents",
      "fetch_team_capacity",
    ],
    systemHint:
      "You are the Workforce Intelligence agent. Answer from tool data only, cite evidence and confidence, " +
      "say INSUFFICIENT_DATA when signals are thin, and never take consequential actions.",
  }),
  recruitment: definePolicy({
    id: "recruitment",
    description: "Recruitment intelligence: candidate search, comparison, screening drafts. Writes need approval.",
    tools: [
      "search_candidates",
      "get_workforce_insights",
      "fetch_documents",
      "fetch_team_capacity",
      "screen_candidate",
    ],
    systemHint:
      "You are the Recruitment Intelligence agent. Search and compare candidates from tool data, explain every " +
      "ranking with evidence, flag missing information, and request human confirmation before any screening verdict. " +
      "Never use protected characteristics; hiring decisions stay with humans.",
  }),
  general: definePolicy({
    id: "general",
    description: "General HR copilot: the full authorized tool surface under standard confirmations.",
    tools: COPILOT_TOOL_CATALOG.map((t) => t.name),
    systemHint: "You are the general HR copilot. Use the authorized tools and request confirmation for writes.",
  }),
};

/**
 * Intersects a caller-requested tool list with an agent policy. Unknown
 * agent → general (broadest policy, still RBAC-enforced downstream).
 */
export function resolveAgentTools(agent: AgentId | string | null | undefined, requested: string[]): string[] {
  const policy = (agent && AGENT_POLICIES[agent as AgentId]) || AGENT_POLICIES.general;
  const allowed = new Set(policy.tools);
  return requested.filter((name) => allowed.has(name));
}

/** True when every policy tool exists in the catalog (also enforced at import). */
export function policiesValid(): boolean {
  return Object.values(AGENT_POLICIES).every((p) => p.tools.every((t) => CATALOG_NAMES.has(t)));
}
