# Fluxentiq — Schema Reconciliation Report

Reconciling the 26 combined Supabase migrations (11 from the platform
workspace + 15 from the enterprise codebase) into one unified, drift-free
schema.

---

## 1. The core finding

The two codebases define **overlapping core tables with incompatible
schemas**. Their migrations run first (timestamps `20250811…`), and use bare
`CREATE TABLE` (no `IF NOT EXISTS`). Our migrations use
`CREATE TABLE IF NOT EXISTS`, so after `supabase db reset` the **first
definition wins** for the shared tables — meaning our app would silently bind
to *their* schema and break (our data layer reads `employees.email`, which
their table does not have — it has `work_email`).

## 2. Conflict map (tables defined by BOTH)

| Table | Theirs | Ours | Resolution |
|---|---|---|---|
| `organizations` | `legal_name, primary_color, timezone, plan_code, trial_ends_at…` | `name, slug, plan, billing_status…` | **Merge** — ours canonical + adopt their columns |
| `employees` | `user_id, employee_number, work_email, department_id, job_title_id, status…` | `email, department, role, title, employment_status, source_tag…` | **Merge** — add our columns, keep their richer columns |
| `candidates` | `job_openings/resumes/applications` FKs | `job_posting_id, match_score, stage, source…` | **Merge** — add our columns |
| `audit_logs` | `actor_user_id, before_state, after_state` | `actor_id, metadata` | **Merge** — add our `metadata` |
| `notifications` | (base fields) | `kind, read, description` | **Merge** — add our fields |
| `leave_requests` | (leave types FK) | `employee_name, source_tag` | **Merge** — add our fields |
| `leave_balances` | (leave types FK) | `used_days, source_tag` | **Merge** — add our fields |
| `payroll_line_items` | (payroll entries) | `employee_name, gross_pay, deductions, net_pay, source_tag` | **Merge** — add our fields |
| `workflows` / `workflow_runs` | (automation engine) | `trigger_event` / `executed_actions, error` | **Merge** — add our fields |

## 3. Canonical decision

**Our core schema is canonical** for the shared tables, because the entire
running application depends on it:

- `lib/api.ts` + `lib/actions.ts` (typed Supabase client)
- `lib/domain.ts` (the 18 module pages built in Step 2)
- `lib/memory/` (pluggable storage, table-name based)

Their extended **domain tables are additive** (no conflict) and are adopted
as-is: `performance_cycles`, `goals`, `feedback_notes`, `attendance_records`,
`learning_*`, `benefit_*`, `equity_*`, `expense_reports`, `pulse_surveys`,
`workforce_scenarios`, `contractor_invoices`, `compensation_bands`, etc.

The reconciliation migration `20260817001200_schema_reconciliation.sql` runs
**last** and applies `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for every
column our app requires, so the unified schema serves the running app
regardless of which migration created each table. It is idempotent and
non-destructive.

## 4. What is NOT reconciled (honest scope note)

Their `src/services/` + `app/actions/` (the legacy data layer) are written
against their *original* column names (`work_email`, `status`, `department_id`)
and are **not currently wired into any running page**. They remain available
as reference implementations; wiring them requires a column-mapping adapter
(see `INTEGRATION_MAP.md`, deferred workstream). The reconciliation here makes
the **database** coherent for the running app; it does not retro-fit the
unwired legacy service layer.

## 5. Verification

After `supabase db reset`, run:

```sql
-- confirm no duplicate-table errors and our columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'employees' AND column_name IN ('email','department','role','employment_status');
```
