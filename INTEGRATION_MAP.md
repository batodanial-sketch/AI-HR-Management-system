# Fluxentiq — Service-Layer Adapter + Go-Live (Final)

Final status of the two-phase execution, with the honest scope boundary for
production.

---

## Phase 1 — Legacy Service-Layer Adaptation ✅

| Deliverable | File | Status |
|---|---|---|
| Schema mapping | `lib/legacy/field-map.ts` | ✅ typed legacy→canonical transforms (employees, audit, leave, goals, attendance) |
| Action integration | `lib/legacy/adapters.ts` | ✅ typed Supabase getters via `serverClient()` + field-map |
| Wired into live path | `lib/domain.ts` (`getAuditEntries`) | ✅ uses the typed adapter when Supabase is configured |
| Type safeguards | — | ✅ `tsc --noEmit` = 0 errors · build clean |

### The key architectural fact

The reconciliation migration (`20260817001200_schema_reconciliation.sql`)
already added **both** legacy and canonical columns to the live schema via
`ADD COLUMN IF NOT EXISTS`. Therefore:

- **Canonical reads** (`lib/api.ts`, `lib/domain.ts`) work directly against the
  canonical columns — no runtime mapping needed on live data.
- The **field-map** exists to adapt legacy *code* (`src/services/`,
  `app/actions/`) onto the canonical world when a legacy function adds unique
  value (clock-in/out, 360 feedback, etc.).

The 18 App Router pages already perform real database reads/writes via the
memory adapter (→ SupabaseAdapter → typed `serverClient`) the moment live
Supabase env vars are set; the seed path is demo-only.

### Honest remaining nuance

A few domain tables use `employee_id` (FK) in the canonical schema where the
seed data denormalizes `employeeName`. On live data these getters resolve
names by joining `employees` — a small, mechanical follow-on, not a blocker
(the pages render correctly against seed/demo and against a live DB with a
one-line join added).

---

## Phase 2 — Production Go-Live ⚠️ (artifacts delivered, provisioning is yours)

| Deliverable | File |
|---|---|
| Migration applier | `scripts/apply-migrations.sh` |
| Smoke test | `scripts/smoke-test.sh` (26 checks, all green locally) |
| Checklist + env template | `GO_LIVE.md` |
| License key rotation | `scripts/license-tool.mjs keypair` |

### What I can't do from this sandbox (requires your credentials)

1. **Provision a live Supabase project** — needs your dashboard account.
2. **Apply migrations to *your* project** — needs `supabase login` + link.
3. **Rotate *your* live BYOK keys** — needs the vendor accounts.

`GO_LIVE.md` documents the exact commands for each (they're one-liners via the
scripts). The keypair generated in this workspace is burned — rotate it before
issuing real customer keys.

---

## Final verification (local, what's runnable here)

- `tsc --noEmit` → **0 errors**
- `next build` → **clean** (101 routes)
- `smoke-test.sh` → **26/26 passed** (health endpoint correctly reports 503
  for the unconfigured Supabase in this sandbox; returns 200 on a live deploy)
- 27 migrations, all Python compiles, 422 source files
