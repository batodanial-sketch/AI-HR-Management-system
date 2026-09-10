# FLUXENTIQ AI — PHASE F REPORT

**Date:** 2026-09-10 · **Phase:** F — Workflow Engine, Approvals & Copilot Bridge
**Canonical branch:** `arena/01a07c94-ai-hr-management-system` · **Code anchor:** `2338e0b` (pushed; tree clean at report time)
**Base:** `bfe7400` (pre-Phase-F checkpoint) · **Companions:** `docs/PHASE_F_WORKFLOW_GAP_MATRIX.md` (§2 deliverable), `docs/WORKFLOW_ARCHITECTURE.md`
**Execution mode:** Master Product Evolution brief (code changes expected, each with §32 change-control justification) + Phase F brief (security controls never bypassed from workflow code).

---

## 1. Executive verdict

**Phase F is COMPLETE and GO for review/merge.** A deterministic, human-gated workflow engine now runs on the existing Supabase schema with zero new tables: run state machine, six-type step vocabulary, idempotent REST (14 handlers), verified webhooks with business-key tenancy, six narrow copilot tools, a 3-template executable allowlist, an Approval Center with separation of duties, run detail, a command-center section, and daily-task hardening. All validation gates pass: **284/284 jest tests (29 suites), `tsc --noEmit` clean, ESLint zero warnings, `next build` success, migration replay verifier green.** No secrets in code or evidence; no weakened controls; no fabricated functionality — deferred items are named with rationale in §15.

## 2. Scope & acceptance (gap-matrix build items 1–12)

| # | Committed item | Delivered | Evidence |
|---|---|---|---|
| 1 | Run-machine migration (7 cols, idempotency unique index, no status CHECK) | ✅ | `supabase/migrations/20260910000200_phase_f_workflows.sql`, `workflowMigration.test.ts` |
| 2 | `machine.ts` — run/step/task transitions, server-enforced | ✅ | `lib/workflows/machine.ts`, `workflowMachine.test.ts` |
| 3 | `store.ts` — session/service stores, test-only memory store | ✅ | `lib/workflows/store.ts` (service pin asserted every method) |
| 4 | `idempotency.ts` — deterministic run/step/webhook keys | ✅ | `lib/workflows/idempotency.ts`, machine suite §keys |
| 5 | `failures.ts` — 6-code classifier, backoff, budgets | ✅ | `lib/workflows/failures.ts`, executor retry tests |
| 6 | `executor.ts` — deterministic engine, 6 step types, proposal path | ✅ | `lib/workflows/executor.ts` + `runtime.ts`, `workflowExecutor.test.ts` |
| 7 | REST: definitions/runs/approvals/versions/cancel/retry | ✅ + lifecycle | 14 handlers under `app/api/workflows/`, `workflowRoutes.test.ts` |
| 8 | Webhook route: verified → allowlisted → idempotent runs | ✅ | `app/api/workflows/webhooks/route.ts`, `workflowWebhooks.test.ts` |
| 9 | Copilot tools (READ ×4, PROPOSE ×1, WRITE ×1; no decide tools) | ✅ | `lib/ai-providers.ts`, `lib/copilot/tools.ts`, `lib/agents/taxonomy.ts`, `workflowTools.test.ts` |
| 10 | `bridge.ts` — templates + insight→draft suggestions | ✅ | `lib/workflows/templates.ts`, `bridge.ts`, `workflowBridge.test.ts` |
| 11 | Approval Center + command-center section (+ run detail) | ✅ | `app/approvals/`, `app/workflows/runs/[runId]/`, `app/command-center/page.tsx` |
| 12 | Task transitions, owner-or-privileged, re-execution guard | ✅ | `machine.ts` task map, `workflowActions.ts`, `workflowTaskHardening.test.ts`, single-fire tests |

**Naming deviation (§32):** the matrix sketched `list_workflows / get_workflow / list_pending_approvals / propose_workflow / run_workflow`; the implementation uses repo-conventional `fetch_workflows / get_workflow / fetch_workflow_runs / fetch_workflow_approvals / propose_workflow / start_workflow_run`. Same coverage (plus a runs list the matrix implied but didn't name). No functional deviation.

## 3. State machine

`queued → running → waiting_approval → … → succeeded`, with `failed`/`cancelled` terminals, cancel from non-terminal states, and retry from `failed`. Every mutation asserts the transition server-side **and** re-checks inside `guardedAdvance` compare-and-swap writes — UI state can never force an illegal transition. No DB CHECK on status: legacy rows belong to the external Python bridge (unknown vocabulary); the machine governs Phase F runs in application code, with the reason recorded in the migration header.

## 4. Deterministic executor

`driveRun` advances a run to a resting state with no model calls and no outbound HTTP. Pinned invariants: **single-fire** (steps execute ≤ once per run; jumps over succeeded steps skip forward; cycles terminate; the 100-visit cap is defense-only), **ledger honesty** (`(run)` markers never satisfy steps; `(approval)` satisfactions do), **approve→settle→resume** in one call with frozen proposal args executed verbatim, **deny→permanent fail** (`PERMANENT_ERROR`, unretryable), and `SYSTEM_ACTOR` attribution that can never decide approvals. All I/O flows through the injected `DriveDeps` seam (store/notify/audit/callTool/propose/propose-settle/clock).

## 5. Approvals + separation of duties

`canDecideApproval` enforces, in order: (1) humans only — the system actor is rejected; (2) **separation of duties** — the run initiator cannot decide their own run (system runs have no requester, so the rule lifts); (3) step minimum tier (`HR_ADMIN` default, `MANAGER` when authored). Enforced at **three layers**: Approval Center button visibility (UX only), API early-403 with a specific message, and `applyApprovalDecision` itself (`FORBIDDEN`). Double-decide loses (`ALREADY_DECIDED` → 409). No copilot tool for approve/deny exists or may be added without revisiting this section — decisions are explicit UI actions only.

## 6. Failure/retry handling

Six classified codes; only transient classes retry, with bounded exponential backoff and attempt budgets. Terminal codes (`VALIDATION`, `AUTHORIZATION_ERROR`, `PERMANENT_ERROR`, …) fail fast — non-idempotent operations are never blindly retried. Retry is operator-driven (`POST …/retry`; early attempts get 429 + `Retry-After` + `retryAfterMs`). Cron auto-retry is deferred for lack of a worker session (§15).

## 7. Versioning

Runs pin `workflowVersion` at creation and are never mutated by later publishes; `POST …/versions` validates graphs against the step vocabulary before saving. Definition lifecycle is server-enforced: `draft → active | archived`, `active → archived`, `archived → draft` (activation requires an executable version; same-status PATCH is an honest no-op; all else 409). Draft cap (25/org, `DRAFT_CAP`) forces curation; delete is draft-only with zero run history — runs are immutable history and are never orphaned.

## 8. REST API

14 handlers under `app/api/workflows/` (definitions, run, versions, runs, run detail, cancel, retry, approvals, approve, deny, webhooks), plus pre-existing `trigger` (untouched). Auth model: definitions/runs readable by members; run/retry/cancel by initiator-or-privileged (system runs: privileged only); approvals listed by MANAGER+; approve/deny by tier + SoD; definition writes by HR_ADMIN+. Org identity always from the trusted session. Error mapping centralized in `mapDriveError`. `Cache-Control: no-store` on all responses.

## 9. Webhooks

HMAC-SHA256 verification (fail-closed 503 unconfigured, 401 bad signature), 4-event allowlist mirroring the builder vocabulary, receipts in `inbound_webhook_events`. **Tenancy resolves from business keys** (`employee_id → employees.organization_id`, etc.) — payload org claims are never trusted; unresolvable deliveries return 200 with `processed: 0`. Exactly one run per matched workflow per delivery fingerprint; redeliveries dedupe without re-driving (bounded at 25 workflows/delivery, overflow reported via `truncated`). Drives run under `systemDeps` (pinned service store, direct notify, admin audit, fail-closed tool/proposal stubs): `tool_call` steps in system runs fail honestly until a human resumes.

## 10. Copilot bridge (six narrow tools)

| Tool | Kind / Category | Effect |
|---|---|---|
| `fetch_workflows` / `fetch_workflow_runs` / `fetch_workflow_approvals` / `get_workflow` | read / READ | Cookie-forwarded GETs; caller RBAC inherited |
| `start_workflow_run` | **write** / WRITE | Proposal-gated, frozen args, confirmation |
| `propose_workflow` | read / **PROPOSE** | Auto-executes; creates **inert drafts only** |

`propose_workflow` is deliberately `kind: "read"` so the runtime takes the auto-execute path per PROPOSE semantics — safe because the route hard-forces `status: "draft"`, drafts cannot run, and activation/deletion have no tools (pinned by test). First PROPOSE-category tool in the catalog. Agent narrowing: `general` inherits all six; `intelligence`/`recruitment` get none; taxonomy completeness pinned by test. **Inside** `tool_call` steps the policy narrows further: 9 reads inline, 3 writes via proposal (`screen_candidate`, `create_survey`, `start_workflow_run`) — each child-run hop human-approved, so no unbounded recursion; everything else `denied`.

## 11. Templates + bridge

v1 allowlist of 3 executable templates (steps validated at import): `new_hire_welcome` (`employee.created` → notify → end), `leave_request_review` (`leave.requested` → approval → notify → end), `payroll_completion_digest` (`payroll.completed` → notify → end). `instantiateTemplate` treats params as untrusted (zod; unknown template/bad params → `VALIDATION`). `templateForInsightCategory` maps `onboarding`/`leave` and returns `null` otherwise — an honest "no suggestion" instead of an invented one. Instantiation always yields a draft via `POST /api/workflows` (`fromTemplate`).

## 12. UI surfaces

**Approval Center** (`/approvals`, MANAGER+): Why / Evidence / What-changes / Who-is-affected / Can-it-be-undone cards for authored approvals, frozen-args cards for tool calls, tier badges, pending/decided filters, approve/deny with pending + error states (deny confirms; decisions final). **Run detail** (`/workflows/runs/:id`, member-visible): status, failure code + next-retry, full ledger timeline, per-run approvals, initiator-or-privileged cancel/retry. **Command center**: pending-approval count (MANAGER+, honest note otherwise), active/failed badges, 5 recent runs, Approval Center quick action. All server-rendered, `force-dynamic`, role-degraded honestly — never silent empties, never unauthorized data.

## 13. Tenancy, RLS, audit, secrets

- Org identity from `getRbacContext` / `requireOrganizationContext` or verified business keys only — never AI output, client bodies, or role claims. AI never approves its own proposals, never escalates permissions, never converts recommendations into irreversible actions (drafts inert; writes proposal-gated; approvals human-only).
- RLS member-gates every workflow table for the session client; privilege tiers enforced in routes + executor (documented split, same as `workflows_all`). Service store pin asserted on all 17 methods + per-query org scoping; webhook drives only.
- Audit: `workflow.run.*` / `workflow.approval.*` on every transition with org attribution; ledger entries carry codes, never traces; persisted tool outputs are `{ok, message}` only (PII minimization).
- **Secrets:** none in code, migrations, tests (fixture `test-webhook-secret` only), or evidence. `WORKFLOW_WEBHOOK_SECRET`: env-only; status reported as PRESENT/MISSING/INVALID, never echoed. Grep-verified pre-commit.

## 14. Test evidence + gates (source of truth)

10 workflow suites / 87 tests, plus full-repo green:

| Gate | Command | Result |
|---|---|---|
| Unit (all) | `CI=1 npx jest` | **29 suites / 284 tests pass** |
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | zero warnings/errors |
| Build | `npm run build` | success; 13 workflow API routes + `/approvals` + run detail in table |
| Migration replay | `workflowMigration.test.ts` (in-suite) | libpg_query parse-valid + pg-mem double-apply, 7/7 cols, dedup enforced, NULL-key rows unaffected |

Route tests drive the **real executor** through the HTTP layer with mocked seams only at RBAC/deps; webhook tests prove HMAC/org-from-key/redelivery; SoD pinned at executor + route levels; lifecycle (create/PATCH/DELETE/transitions/cap) pinned; task hardening drives the real action + real scope guard. RLS policy *semantics* need a live Postgres/Supabase pass at deploy time (no DB in sandbox — §16).

## 15. Honestly deferred + known gaps

Deferred with rationale (per gap matrix): outbound webhook steps (needs integration allowlist + secret store), cron auto-retry (no worker session), event-based waits, manager team-scope task mutation (owner-or-privileged in v1 — managers get an honest message), full onboarding/offboarding template suites, dual approval. `docs/AI_ARCHITECTURE.md` never existed — not invented. Pre-existing surfaces untouched and unclaimed: visual builder canvas (local-only; Save persists nothing), legacy daily-task template system, `/api/workflows/trigger`. No runs-list page yet (runs reachable via approvals, command center, run detail) — suggested follow-up, not acceptance.

## 16. Decision gate + handoff

**Gate: GO for review/merge.** No blockers, no weakened controls, no fabricated evidence; working tree clean at `2338e0b` + this report. **Deploy notes:** (1) set `WORKFLOW_WEBHOOK_SECRET` or webhook deliveries 503 by design; (2) run the RLS/authz suite against staging Supabase for policy-semantics confirmation; (3) no backfill needed (partial index + NULL-tolerant columns; legacy rows unaffected). **Suggested next:** cron worker session design (unlocks auto-retry + event waits) → integration allowlist (unlocks outbound steps) → manager team-scope rule → template expansion → dual approval. Architecture: `docs/WORKFLOW_ARCHITECTURE.md`. Gap record: `docs/PHASE_F_WORKFLOW_GAP_MATRIX.md`.
