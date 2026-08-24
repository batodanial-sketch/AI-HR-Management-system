#!/usr/bin/env python3
"""Generate lib/database.types.ts — merged (live + canonical) schema.

Merges the LIVE PostgREST schema (what actually exists) with the canonical
migration column definitions so the types reflect the INTENDED schema
(superset). Drifted tables (live missing canonical columns) get those columns
added to their Row/Insert/Update types; the companion RECONCILE_COLUMNS.sql
brings the live DB up to match.

Also emits the `bootstrap_organization` RPC signature.
"""
import glob, json, os, re

LIVE = json.load(open("/tmp/postgrest_defs.json"))["definitions"]
# canonical migration columns: table -> [(col, ts_type, nullable)]
CREATE_MAP = json.load(open("/tmp/create_map_typed.json"))

SNAKE = re.compile(r"^[a-z][a-z0-9_]*$")

# Tables referenced by code but entirely absent from live (created separately).
MISSING = ['access_revocation_records','asset_assignments','benefit_dependents','benefit_enrollments','bonus_awards','certification_definitions','compliance_assignments','compliance_requirements','contractors','currency_rates','employee_certifications','equity_vesting_events','external_webhook_logs','goal_check_ins','learning_enrollments','learning_lesson_progress','learning_lessons','learning_quiz_attempts','learning_quiz_questions','learning_quizzes','offboarding_tasks','onboarding_document_signing_requests','performance_calibration_records','performance_feedback_requests','performance_feedback_responses','policy_acknowledgements','pulse_responses','scheduled_jobs','talent_assessments','webhook_deliveries','webhook_subscriptions','workforce_forecasts']

ENUMS = """export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrgRole = "owner" | "admin" | "manager" | "member";
export type EmploymentStatus = "active" | "on_leave" | "terminated";
export type RecruitmentStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "rejected";
export type Recommendation = "advance" | "hold" | "reject";
export type LeaveType = "pto" | "sick" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type PayrollRunStatus = "draft" | "processing" | "completed" | "failed";
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";
export type DealStage =
  | "discovery"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";
"""

FUNCTIONS = """    Functions: {
      bootstrap_organization: {
        Args: { workspace_name: string; workspace_slug: string };
        Returns: Array<{
          organization_id: string;
          organization_name: string;
          organization_slug: string;
          role_code: string;
        }>;
      };
    };"""


def map_live(cm: dict) -> str:
    t = cm.get("type"); fmt = cm.get("format", "") or ""
    if t == "boolean": return "boolean"
    if t in ("integer", "number"): return "number"
    if t == "array":
        items = cm.get("items", {})
        it = (items.get("type") if isinstance(items, dict) else "") or ""
        return "number[]" if it in ("integer", "number") else "string[]"
    if t is None and fmt == "jsonb": return "Json"
    return "string"


def emit_table(name: str, cols: list[tuple[str, str]]) -> str:
    row = "".join(f"          {c}: {ty};\n" for c, ty in cols)
    ins = "".join(f"          {c}?: {ty} | null;\n" for c, ty in cols)
    return f"""      {name}: {{
        Row: {{
{row}        }};
        Insert: {{
{ins}        }};
        Update: {{
{ins}        }};
        Relationships: [];
      }};"""


def main() -> None:
    tables: dict[str, str] = {}

    # 1. Live tables, merged with canonical-only columns.
    for name in LIVE:
        if not SNAKE.match(name) or "properties" not in LIVE[name]:
            continue
        live_cols = [(c, map_live(cm)) for c, cm in LIVE[name]["properties"].items() if SNAKE.match(c)]
        col_map = dict(live_cols)
        if name in CREATE_MAP:
            for c, ty, _nullable in CREATE_MAP[name]:
                if c not in col_map:
                    col_map[c] = ty
        tables[name] = emit_table(name, list(col_map.items()))

    # 2. Canonical tables entirely missing from live.
    for name in MISSING:
        if name not in tables and name in CREATE_MAP:
            cols = [(c, ty) for c, ty, _n in CREATE_MAP[name]]
            tables[name] = emit_table(name, cols)

    body = "\n\n".join(tables[name] for name in sorted(tables))
    out = f"""/** AUTO-GENERATED database types — MERGED (live + canonical) schema.

 * Merges the LIVE Supabase schema with the canonical migration columns so the
 * types reflect the intended superset. Drifted tables (live missing canonical
 * columns) are reconciled here; run supabase/RECONCILE_COLUMNS.sql to make the
 * live DB match. Regenerate with scripts/gen-database-types.py.

 * Enum columns are `string`; jsonb columns are `Json`. Insert/Update are
 * all-optional so partial payloads type-check while unknown column names fail.
 */

{ENUMS}
export interface Database {{
  public: {{
    Tables: {{
{body}
    }};
    Views: {{}};
{FUNCTIONS}
    Enums: {{}};
    CompositeTypes: {{}};
  }};
}}
"""
    open("lib/database.types.ts", "w").write(out)
    print(f"generated {len(tables)} tables")


if __name__ == "__main__":
    main()
