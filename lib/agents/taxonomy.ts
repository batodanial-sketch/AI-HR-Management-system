/**
 * Human-in-the-loop action taxonomy — the CENTRAL policy vocabulary.
 *
 * Every copilot tool maps to exactly one category (client-safe, no I/O so
 * the UI can render the same labels the server enforces):
 *
 *   READ       Fetch data. Auto-executes when the caller is authorized.
 *   ANALYZE    Compute over authorized data (insights, briefings, matches).
 *              Auto-executes; output is advisory and always cites evidence.
 *   PROPOSE    Draft a recommendation or content for human review.
 *              Auto-executes; the artifact itself is inert until a human acts.
 *   WRITE      Mutate state (create/update rows). ALWAYS becomes a
 *              server-side proposal: frozen args, human approval, claim,
 *              receipt, audit. The model can never execute a WRITE. The
 *              approver must hold a privileged role (current claim rule).
 *   CONSEQUENT Employment-impacting or irreversible effects (exit
 *              finalization, candidate screening verdicts). Enforced exactly
 *              like WRITE today (proposal + privileged approver); the label
 *              additionally flags the action for employment-decision review
 *              and future policy hooks (e.g. dual approval).
 *
 * Handling today: READ/ANALYZE/PROPOSE execute inline; WRITE/CONSEQUENT go
 * through `lib/copilot/proposals.ts`. This module only NAMES the handling —
 * it never loosens it. Unknown tools resolve to CONSEQUENT (fail closed).
 */

export type ActionCategory = "READ" | "ANALYZE" | "PROPOSE" | "WRITE" | "CONSEQUENT";

export const ACTION_CATEGORIES: ActionCategory[] = ["READ", "ANALYZE", "PROPOSE", "WRITE", "CONSEQUENT"];

/** Human-readable handling semantics per category (rendered in docs + UI). */
export const CATEGORY_SEMANTICS: Record<ActionCategory, { label: string; handling: string }> = {
  READ: { label: "Read", handling: "Auto-executes when authorized. No confirmation." },
  ANALYZE: { label: "Analyze", handling: "Auto-executes when authorized. Advisory output with evidence." },
  PROPOSE: { label: "Propose", handling: "Auto-executes when authorized. Produces an inert draft for human review." },
  WRITE: { label: "Write", handling: "Requires human approval via server-side proposal (frozen args, privileged approver, receipt, audit)." },
  CONSEQUENT: { label: "Consequential", handling: "Requires human approval via server-side proposal (frozen args, privileged approver, receipt, audit) + employment-decision review flag." },
};

/**
 * Central tool → category map. MUST cover every name in
 * COPILOT_TOOL_CATALOG (pinned by test). Adding a tool without a category
 * fails closed to CONSEQUENT at runtime AND fails the completeness test.
 */
export const TOOL_ACTION_CATEGORIES: Record<string, ActionCategory> = {
  // Reads — inherit caller RBAC, auto-execute.
  fetch_benefits: "READ",
  fetch_equity: "READ",
  fetch_expenses: "READ",
  fetch_surveys: "READ",
  fetch_planning: "READ",
  fetch_contractors: "READ",
  fetch_offboarding: "READ",
  fetch_assets: "READ",
  fetch_documents: "READ",
  fetch_team_capacity: "READ",
  search_candidates: "READ",
  search_knowledge: "READ",
  fetch_workflows: "READ",
  fetch_workflow_runs: "READ",
  fetch_workflow_approvals: "READ",
  get_workflow: "READ",
  // First PROPOSE tool: auto-executes but creates only INERT drafts —
  // drafts cannot run; activation is human-only (PATCH, no tool). The
  // catalog marks it kind:"read" deliberately so the runtime takes the
  // auto-execute path; the route hard-forces status=draft.
  propose_workflow: "PROPOSE",
  // Analyses — advisory, evidence-cited, auto-execute.
  get_workforce_insights: "ANALYZE",
  get_hr_briefing: "ANALYZE",
  // Writes — proposal-gated, any approver with canonical membership.
  create_expense: "WRITE",
  create_survey: "WRITE",
  create_scenario: "WRITE",
  create_contractor: "WRITE",
  create_asset: "WRITE",
  start_workflow_run: "WRITE",
  // Consequential — proposal-gated + privileged approver.
  approve_offboarding: "CONSEQUENT",
  screen_candidate: "CONSEQUENT",
};

/** Category for a tool name; unknown tools fail closed to CONSEQUENT. */
export function categoryForTool(toolName: string): ActionCategory {
  return TOOL_ACTION_CATEGORIES[toolName] ?? "CONSEQUENT";
}

/** True when the category requires a human-approved proposal before execution. */
export function requiresConfirmation(category: ActionCategory): boolean {
  return category === "WRITE" || category === "CONSEQUENT";
}

/** True when the category requires a privileged approver role at claim time. */
export function requiresPrivilegedApprover(category: ActionCategory): boolean {
  return category === "WRITE" || category === "CONSEQUENT";
}
