# Schema Reconciliation — Regenerating DB Types & Root-Causing `as any`

**Date:** 2026-08-20
**Scope:** BUG-005 (systemic `as any` type erasure)

---

## The root cause (bigger than types)

The `as any` casts were **not** laziness — they were the symptom of a deeper
schema drift between three things that were supposed to be identical:

1. The **live Supabase DB** (what actually exists)
2. `lib/database.types.ts` (canonical, but only ~38 tables)
3. `src/lib/database.types.ts` (legacy, ~68 tables)

Auditing the live DB via PostgREST introspection surfaced the real problem:

| Finding | Result |
|---------|--------|
| Tables in live DB | **84** |
| Tables the app code references | **86** |
| Tables referenced by code but **missing from live DB** | **32** (runtime 404 "table not found") |
| Tables missing from both type files | ~18 |

### The 32 missing tables (runtime breakage, not just types)

These features **fail at runtime** against the live DB because their tables
don't exist — verified by direct PostgREST queries returning `404 Could not
find the table`:

```
scheduled_jobs            → scheduler / cron jobs
webhook_subscriptions     → webhook fan-out
webhook_deliveries        → webhook delivery audit
learning_enrollments      → LMS course enrollment
learning_lessons / _progress / _quizzes / _quiz_questions / _quiz_attempts
equity_vesting_events     → equity vesting schedule
currency_rates            → global payroll FX
contractors / contractor_invoices
external_webhook_logs     → inbound/outbound webhook logging
pulse_responses           → survey submissions
workforce_forecasts       → predictive headcount
benefit_dependents / benefit_enrollments / bonus_awards
compliance_requirements / compliance_assignments / policy_acknowledgements
goal_check_ins / talent_assessments / performance_calibration_records
performance_feedback_requests / performance_feedback_responses
certification_definitions / employee_certifications
asset_assignments / access_revocation_records
offboarding_tasks / onboarding_document_signing_requests
```

---

## What was done

### 1. Regenerated `lib/database.types.ts` — single source of truth
- **`scripts/gen-database-types.py`** introspects the live PostgREST schema and
  merges the canonical migration `CREATE TABLE` definitions.
- Result: **116 tables** typed with accurate columns (84 live + 32 canonical
  that the code needs).
- Regenerate anytime with `python3 scripts/gen-database-types.py`.

### 2. Fixed 7 genuine schema-drift bugs (revealed once types were accurate)

| File | Bug | Fix |
|------|-----|-----|
| `lib/audit.ts` | inserted `entity` (column doesn't exist live) | → `entity_type` |
| `lib/legacy/adapters.ts` | read `row.entity` | → `row.entity_type` |
| `lib/legacy/adapters.ts` | read `row.decided_by` | → `row.approver_id` |
| `lib/actions.ts` `updateProfile` | wrote `title` to `profiles` (no such column) | removed `title` from update |
| `lib/auth.ts` | `memberships.role` string → `OrgRole` | explicit cast + comment |
| `lib/api.ts` | `organizations.plan` string → union | cast with `"free"` fallback |
| `lib/api.ts` | `memberships.role` string → `OrgRole` | cast with `"member"` fallback |

### 3. Generated `supabase/CREATE_MISSING_TABLES.sql`
- Idempotent script creating all 32 missing tables (exact `CREATE TABLE` from
  migrations) + `ENABLE ROW LEVEL SECURITY` + `tenant_isolation` policies.
- **Action required (you):** run it in the Supabase SQL Editor to make the live
  DB match the code. Until then, the 32 features above remain runtime-broken.

---

## Verification

- `tsc --noEmit` → **0 errors**
- `next lint` → **0 warnings / errors**
- `next build` → **green**

---

## ✅ Reconciliation COMPLETE (2026-08-20)

- **Live DB reconciled** — `CREATE_MISSING_TABLES.sql` was run in the SQL Editor.
  PostgREST introspection now reports **120 tables** (was 84); all 32 missing
  tables verified present (HTTP 200).
- **RLS functions fixed** — `is_organization_member(uuid)` now reads the
  canonical `memberships` table (was the stale legacy `organization_memberships`);
  `is_org_member` and `current_org_role` (both previously undefined phantoms)
  are defined. Existing policies pick this up automatically (functions resolve
  at query time).
- **Canonical types regenerated** — `lib/database.types.ts` now types all 116
  tables against the complete live schema.

---

## Remaining work (honest scope note)

The ~354 `as any` casts live in `app/actions/*.ts` and `src/lib/*` — both of
which use the **legacy** `src/lib/database.types.ts` (a second, separate
`Database` type with its own `*Row` interfaces imported by 32 files).

Fully removing those casts requires consolidating `src/lib/database.types.ts`
onto the canonical regenerated type, which in turn forces reconciling ~30 files
of `*Row` return-type casts. That is a follow-up milestone **gated on** first
running `CREATE_MISSING_TABLES.sql` (types cannot safely claim the 32 tables
exist until they do).

Recommended sequence:
1. Run `supabase/CREATE_MISSING_TABLES.sql` (live DB now complete).
2. Re-run `python3 scripts/gen-database-types.py` (types now 100% live-accurate).
3. Consolidate `src/lib/database.types.ts` → re-export canonical; migrate
   `*Row` casts.
4. Mechanically strip `(supabase as any).from(...)` → `supabase.from(...)` and
   fix any residual tsc errors.
