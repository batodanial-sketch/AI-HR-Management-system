# Phase F — Workflow Inspection Gap Matrix

Inspect-first evidence for FLUXENTIQ AI Phase F (Workflow Intelligence +
Controlled Automation). Every classification below was verified by reading
the cited code — nothing is assumed from file names.

Base: `bfe7400` (checkpoint of Phases C/D/E + audit work).
Legend: `COMPLETE` · `PARTIAL` · `MISSING` · `NEEDS_HARDENING`

---

## 1. Domain model (tables, RLS, types)

| Capability | Verdict | Evidence |
|---|---|---|
| `workflows` CRUD table + RLS | COMPLETE | `202608150007_workflows.sql` (`workflows`, member RLS); canonical types merged with legacy columns (`trigger_type`, `actions`, `last_run_at`, …) |
| Legacy workflow actions (create / status / overview / run) | COMPLETE | `app/actions/workflowActions.ts` — `requireOrganizationContext("admin")`, org-scoped, audited run |
| `workflow_runs` durable rows + RLS | PARTIAL | Table + RLS exist; row holds `trigger_payload/output/error_message/started_at/finished_at/executed_actions`; **no** idempotency key, version pin, current step, attempt counter, error code |
| `workflow_versions` (versioned graphs) | PARTIAL | Schema + RLS exist (`20260814000100_workflow_automations.sql`, `UNIQUE(workflow_id, version)`); **zero code references**, absent from `database.types` |
| `workflow_approvals` (pending/approved/rejected/expired) | PARTIAL | Schema + RLS exist (same migration); **zero code references**, absent from `database.types` |
| Daily engine tables (`workflow_templates`, `daily_employee_tasks`, `workflow_executions`) + RLS + idempotent upsert key | COMPLETE | `202608260000_employee_workflows.sql`; `generateDailyWorkflowsAction` upserts on org+employee+date+template |
| `scheduled_jobs` + atomic claim | COMPLETE | `lib/scheduler.ts` (single-UPDATE pending→running + `locked_by` token) |

## 2. State machines & transitions

| Capability | Verdict | Evidence |
|---|---|---|
| Run state machine (queued/running/waiting/failed/…) | MISSING | `runWorkflowAction` writes free-text `"queued"`; no transition map anywhere; bridge owns later states opaquely |
| Task status transitions | NEEDS_HARDENING | `updateTaskStatusAction` accepts **any → any** status (completed→pending allowed), no ownership check (any org employee can mutate anyone's task) |
| Step lifecycle (daily engine) | PARTIAL | `workflow_executions` rows queued→running→succeeded/failed; **no** re-execution guard (double-click duplicates `notification_dispatch` inserts) |
| Cancellation path | MISSING | `cancelled` exists only as a daily-task status value; runs cannot be cancelled |
| Run version pinning | MISSING | `workflow_versions` unused; nothing ties a run to a definition version |

## 3. Execution & step types

| Capability | Verdict | Evidence |
|---|---|---|
| Daily step executor (attendance/pulse/notify/digest/scoring/anomaly/custom) | PARTIAL | `executeWorkflowStepAction` — inline + Python-bridge delegation; attendance upsert idempotent; notify/AI steps not idempotent; no retry; no approval/condition/wait/webhook types |
| Local multi-step run engine (Next.js) | MISSING | Only paths are the daily-step switch and `enqueuePythonJob("workflow", …)` to the external bridge (`BLOCKED_EXTERNAL` locally → legacy runs fail closed) |
| APPROVAL step | MISSING | No step type; `workflow_approvals` table unused |
| CONDITION / WAIT / AI_PROPOSAL steps | MISSING | No branching, waiting, or proposal-materialization steps |
| Outbound WEBHOOK step | MISSING | Deliberately deferred in Phase F (no integration allowlist → exfiltration boundary unresolved; see scope) |
| Generic WRITE step | MISSING | Deliberately **not** built as a primitive; Phase F routes writes through claimed copilot proposals instead (reuses `proposals.ts`) |

## 4. Idempotency, retries, failure handling

| Capability | Verdict | Evidence |
|---|---|---|
| Daily-task generation key | COMPLETE | `taskIdempotencyKey(org, employee, date, template)` + DB unique constraint |
| Run-creation idempotency | MISSING | Duplicate `runWorkflowAction` = duplicate run + duplicate bridge job (no key) |
| Bridge enqueue key | MISSING | `enqueuePythonJob` posts with no idempotency key |
| Retry policy / backoff / max attempts | MISSING | Scheduler marks `failed` terminally; no retry anywhere |
| Dead-letter / resume | MISSING | No failure ledger beyond `error_log` text |
| Error classification (validation/auth/transient/external/permanent/system) | MISSING | Raw `error.message` strings only |
| Webhook dedupe | MISSING | `app/api/workflows/webhooks/route.ts` verifies HMAC then **returns success without acting** (stub) |

## 5. Approvals & human-in-the-loop

| Capability | Verdict | Evidence |
|---|---|---|
| Copilot proposal lifecycle (create/claim/finish/deny, frozen hashed args, TTL, atomic claim RPCs, demo store, audit) | COMPLETE | `lib/copilot/proposals.ts` + `20260907000100_phase_r_pilot_controls.sql`; canonical pattern Phase F reuses |
| Action taxonomy (READ/ANALYZE/PROPOSE/WRITE/CONSEQUENT, unknown→CONSEQUENT) | COMPLETE | `lib/agents/taxonomy.ts` |
| Agent policies + router | COMPLETE | `lib/agents/{policies,router}.ts` (intelligence / recruitment / general) |
| Workflow approval records + approve/deny API | MISSING | Table exists, unused; no endpoints, no UI |
| Approval Center UI | MISSING | No page; copilot approval cards cover single-tool proposals only |
| Self-approval / AI self-approval guards for workflows | MISSING | No workflow approval path to guard yet |

## 6. AI → workflow bridge

| Capability | Verdict | Evidence |
|---|---|---|
| Insight recommended actions (`requiresApproval`, evidence, confidence, internal hrefs) | COMPLETE | `lib/intelligence/{signals,briefing,types}.ts` |
| Copilot tool framework (catalog + cookie-forwarded executor inheriting caller RBAC) | COMPLETE | `lib/ai-providers.ts`, `lib/copilot/tools.ts` (21 tools) |
| Workflow copilot tools (list/get/propose/run/approvals) | MISSING | Catalog has zero workflow tools |
| Insight → workflow-proposal materialization | MISSING | No path from `InsightAction` to a durable workflow run |
| Executable HR templates (recruitment/onboarding/offboarding) | MISSING | Only 3 daily-task seeds (`getDefaultWorkflowTemplates`); no multi-step HR templates |

## 7. API surface (§23)

| Capability | Verdict | Evidence |
|---|---|---|
| `POST /api/workflows/trigger` | PARTIAL | Dumb proxy to Python bridge; no local semantics |
| `POST /api/workflows/webhooks` | NEEDS_HARDENING | HMAC-verified stub; payload dropped |
| `GET /api/cron/daily-workflows` | COMPLETE | CRON_SECRET fail-closed + constant-time compare + idempotent generation |
| `GET /api/system/cron` (scheduler driver) | COMPLETE | Drives `runDueJobs` |
| `GET/POST/PATCH/DELETE /api/workflows…`, run/approval endpoints | MISSING | Only server actions exist, and the legacy CRUD actions have **zero UI consumers** (verified by grep) |

## 8. UX

| Capability | Verdict | Evidence |
|---|---|---|
| Daily task board + execution logs | COMPLETE | `app/(dashboard)/workflows/page.tsx` + `components/workflows/*` |
| Visual builder canvas | NEEDS_HARDENING | `components/workflow/workflow-canvas.tsx` — full drag/drop canvas, but **Save only flips a local flag** (`setSaved(true)` + timeout); nothing persists |
| Command-center workflow section | MISSING | `app/command-center/page.tsx` has briefing + pipeline only |
| Builder trigger vocabulary | COMPLETE | `employee.created / leave.requested / candidate.advanced / payroll.completed` — reused as the webhook event allowlist |

## 9. Cross-cutting (reuse as-is)

| Capability | Verdict | Evidence |
|---|---|---|
| `requireOrganizationContext` (+ `role`, `roleCode`, `isPrivileged`) | COMPLETE | `app/actions/_shared.ts` |
| `getRbacContext` / `roleAtLeast` / 4 tiers | COMPLETE | `lib/rbac.ts`, `lib/authz/model.ts` |
| `recordAuditLog` (sanitized, demo-safe) + direct `audit_logs` inserts | COMPLETE | `lib/audit.ts` |
| `createNotification` (session-derived org/user) | COMPLETE | `lib/notifications.ts` |
| Edge + AI rate limiting | COMPLETE | `middleware.ts` (429s), `lib/rate-limit`, `lib/edge/rate-limit` |
| Observability metrics | COMPLETE | `lib/observability/metrics` (used by proposals) |
| RLS tenant isolation | COMPLETE | Member-gated policies on all workflow tables |

---

## Phase F build scope (genuine gaps only)

**Build** (each with change-control + proving tests):

1. Migration: run-machine columns on `workflow_runs` (`idempotency_key` unique-per-org, `workflow_version`, `current_step`, `attempts`, `next_retry_at`, `error_code`, `initiated_by`) + approvals lookup index. No status CHECK (bridge owns legacy rows).
2. `lib/workflows/machine.ts` — pure run/step/task transition maps; enforced server-side.
3. `lib/workflows/store.ts` — DI store seam (Supabase prod store; memory store **test-only**, never wired in prod paths); activates `workflow_approvals`/`workflow_versions` via established `as never` precedent.
4. `lib/workflows/idempotency.ts` — deterministic keys (org+workflow+run+step+attempt; webhook event keys).
5. `lib/workflows/failures.ts` — 6-code classifier, retryability, bounded exponential backoff, max attempts.
6. `lib/workflows/executor.ts` — deterministic in-session engine; step types `condition`, `notify`, `approval`, `tool_call` (READ/ANALYZE inline, WRITE/CONSEQUENT via copilot proposal + human claim — executor never claims), `wait_until`, `end`. No model calls, no outbound webhooks, no generic writes.
7. REST: `GET /api/workflows`, `GET /api/workflows/:id`, `POST /api/workflows/:id/run` (idempotent), `GET /api/workflows/runs`, `GET /api/workflows/runs/:id`, `POST …/cancel`, `POST …/retry`, `GET /api/workflows/approvals`, `POST …/approve|deny` (privileged + not-requester), `POST /api/workflows/:id/versions` (builder persistence; runs pin the version).
8. Webhook route: verified payload → allowlisted events → idempotent run creation.
9. Copilot tools: `list_workflows`, `get_workflow` (READ), `list_pending_approvals` (READ), `propose_workflow` (PROPOSE → inert `draft`), `run_workflow` (WRITE → proposal + approval). **No** approve/deny tools (explicit human UI action only).
10. `lib/workflows/bridge.ts` — insight → draft proposal from a server allowlist of 2–3 executable templates; model input treated as untrusted data (validated params only).
11. Approval Center page + command-center workflow section.
12. Hardening: task transition enforcement, task owner-or-privileged mutation rule, step re-execution guard.

**Honestly deferred** (documented in final report, not faked): outbound webhook steps (needs integration allowlist), cron-driven auto-retry (no worker session; operator-driven retry only), event-based waits, manager team-scope task mutation (owner-or-privileged in v1), full onboarding/offboarding template suites, dual approval, `docs/AI_ARCHITECTURE.md` (never existed; out of Phase F scope to invent).
