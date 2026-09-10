# Workflow Architecture (Phase F)

Deterministic, human-gated automation on the existing Supabase schema. No new
tables: steps live in `workflows.actions` JSON with versions in
`workflow_versions`, run state in `workflow_runs`, and decisions in
`workflow_approvals`. The engine makes no model calls and performs no
outbound webhooks — it is pure control flow over allowlisted step types.

Companion: `docs/PHASE_F_WORKFLOW_GAP_MATRIX.md` (what was missing, what was
built, what was honestly deferred).

---

## 1. Run state machine (`lib/workflows/machine.ts`)

```
queued → running → waiting_approval → running → … → succeeded
   ↓         ↓              ↓                          ↓
failed ← cancelled ←─────┴──── (cancel from queued/running/waiting)
   ↑
failed ← waiting/retrying paths, denied approvals, exhausted retries
```

- Transitions are asserted server-side (`assertRunTransitionSafe`) on every
  mutation, and re-checked inside `guardedAdvance` compare-and-swap writes —
  UI state can never force an illegal transition.
- No DB CHECK on `workflow_runs.status`: legacy rows are owned by the
  external Python bridge (unknown vocabulary). The machine governs Phase F
  runs in application code; the migration comment records why.
- Daily-task machine (`TASK_TRANSITIONS`) hardens the legacy daily-task
  surface: terminal states sticky, `failed/cancelled/skipped → pending`
  reopen only. Enforced in `updateTaskStatusAction`.

## 2. Executor (`lib/workflows/executor.ts`)

`driveRun(deps, orgId, runId, actor)` advances a run to a resting state
(`succeeded | failed | waiting | scheduled | contended | not-drivable`).
Deterministic: same version + same trigger payload + same approvals ⇒ same
ledger. All I/O flows through the injected `DriveDeps` seam
(store/notify/audit/callTool/proposeToolCall/settleProposal/`now?`).

Key invariants (all pinned by tests):

- **Single-fire**: each step executes at most once per run. Jumps land on
  already-succeeded steps skip forward; cycles terminate. `MAX_STEP_VISITS
  = 100` is defense-in-depth only, never the termination mechanism.
- **Ledger honesty**: `(run)` start/retry markers never satisfy steps;
  `(approval)` satisfactions do. The append-only ledger in
  `workflow_runs.executed_actions` is the run's audit trail.
- **Approval resume**: approving settles the linked copilot proposal (frozen
  args execute verbatim) and resumes the drive in the same call; denying
  fails the run permanently (`PERMANENT_ERROR`, no retry).
- **Actor honesty**: `SYSTEM_ACTOR` (`system:workflow-engine`) attributes
  system-initiated work and can never decide approvals.

## 3. Step vocabulary (`lib/workflows/steps.ts`)

Six types, zod-validated, unknown types rejected: `condition`, `notify`,
`approval`, `tool_call`, `wait_until`, `end`. Max 50 steps per workflow.

- `condition`: pure predicate over allowlisted paths (`trigger.*`,
  `steps.<key>.*`, depth ≤ 4). No arbitrary expression evaluation.
- `notify`: explicit member UUIDs, verified against the org (strangers are
  skipped, not fatal). Deep links are same-origin `/…` only.
- `approval`: requires `title/reason/minTier + why/evidence/changes/
  affected/reversible` context — the Approval Center card renders exactly
  this envelope. No silent auto-approval path exists.
- `tool_call`: double-allowlisted (see §7). Reads run inline; writes route
  through copilot proposals + human claim. The executor never claims.
- `wait_until`: durable timer (`nextRetryAt`); resume is operator- or
  webhook-driven. No cron worker exists (deferred, §10).
- `end`: terminal marker. No `webhook_call` type exists (deferred, §10).

## 4. Approvals + separation of duties

`canDecideApproval({approver, role, minRole, requesterUserId})`:

1. The system actor can never decide (humans only).
2. The run initiator can never decide their own run (**separation of
   duties**; system-initiated runs have no requester, so the rule lifts).
3. The approver must hold the step's minimum tier (`HR_ADMIN` default,
   `MANAGER` when the author allows).

Enforced at **three** layers: Approval Center button visibility (UX only),
API routes (early 403 with a specific message), and `applyApprovalDecision`
itself (defense in depth — `FORBIDDEN`). Double-decide loses
(`ALREADY_DECIDED`, 409). There is deliberately **no copilot tool** for
approve/deny — decisions are explicit UI actions only.

## 5. REST API (`app/api/workflows/…`, `lib/workflows/handler.ts`)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/workflows` | member | list definitions |
| `POST /api/workflows` | HR_ADMIN+ | create **draft** (blank / template / steps); ≥25 drafts → `DRAFT_CAP` |
| `GET /api/workflows/:id` | member | definition + latest steps |
| `PATCH /api/workflows/:id` | HR_ADMIN+ | lifecycle (below), human-only |
| `DELETE /api/workflows/:id` | HR_ADMIN+ | draft-only, zero runs |
| `POST /api/workflows/:id/run` | member | idempotent start (active + versioned only) |
| `POST /api/workflows/:id/versions` | HR_ADMIN+ | publish validated version |
| `GET /api/workflows/runs` | member | list runs |
| `GET /api/workflows/runs/:id` | member | run + approvals |
| `POST /api/workflows/runs/:id/cancel` | initiator-or-privileged | |
| `POST /api/workflows/runs/:id/retry` | initiator-or-privileged | backoff + budget gated |
| `GET /api/workflows/approvals` | MANAGER+ | + parsed request envelopes |
| `POST /api/workflows/approvals/:id/approve\|deny` | tier + SoD | resumes / fails run |

Definition lifecycle (server-enforced, invalid transitions 409):
`draft → active | archived`, `active → archived`, `archived → draft`.
Activation requires an executable version. Same-status PATCH is an honest
no-op. Error mapping is centralized in `mapDriveError` (`NOT_DUE → 429 +
Retry-After`, `CONTESTED/ALREADY_DECIDED → 409`, …).

## 6. Failure handling + retry (`lib/workflows/failures.ts`)

Six classified codes; only transient classes retry, with bounded
exponential backoff and a max-attempt budget. Terminal codes
(`VALIDATION`, `AUTHORIZATION_ERROR`, `PERMANENT_ERROR`, …) fail fast —
non-idempotent operations are never blindly retried. Retry is
operator-driven (`POST …/retry`, early attempts get 429 + `retryAfterMs`);
cron auto-retry is deferred (§10) because no worker session exists.

## 7. Tool bridge (copilot ↔ workflows)

Six narrow tools, all inheriting caller RBAC via cookie-forwarded route
calls (`lib/copilot/tools.ts`, `lib/ai-providers.ts`, `lib/agents/*`):

| Tool | Kind / Category | Path |
|---|---|---|
| `fetch_workflows` | read / READ | `GET /api/workflows` |
| `fetch_workflow_runs` | read / READ | `GET /api/workflows/runs` |
| `fetch_workflow_approvals` | read / READ | `GET /api/workflows/approvals` |
| `get_workflow` | read / READ | `GET /api/workflows/:id` (dynamic path) |
| `start_workflow_run` | **write** / WRITE | `POST …/run` (proposal + confirmation) |
| `propose_workflow` | read / **PROPOSE** | `POST /api/workflows` (inert draft) |

- `propose_workflow` is deliberately `kind: "read"` so the runtime
  auto-executes it per PROPOSE semantics — safe because the route
  hard-forces `status: "draft"`, drafts cannot run, and activation has no
  tool. First PROPOSE-category tool in the catalog.
- `start_workflow_run` is WRITE: proposal-gated with frozen args, like all
  writes. No approve/deny/activate/delete tools exist.
- Agent narrowing: `general` inherits all six; `intelligence` and
  `recruitment` get none. Taxonomy completeness is pinned by test.
- **Inside** `tool_call` steps the policy narrows further
  (`workflowToolAccess`): 9 reads inline (incl. the 3 workflow reads),
  3 writes via proposal (`screen_candidate`, `create_survey`,
  `start_workflow_run`) — each child-run hop is human-approved, so no
  unbounded recursion. Everything else is `denied`.

## 8. Templates + bridge (`lib/workflows/templates.ts`, `bridge.ts`)

v1 allowlist (3 executable templates, steps validated at import):

- `new_hire_welcome` (`employee.created` → notify → end)
- `leave_request_review` (`leave.requested` → approval → notify → end)
- `payroll_completion_digest` (`payroll.completed` → notify → end)

`instantiateTemplate(id, params)` treats params as untrusted (zod-validated;
unknown template/bad params → `VALIDATION`). `templateForInsightCategory`
maps `onboarding → new_hire_welcome`, `leave → leave_request_review`, else
`null` (honest "no suggestion" instead of an invented one). Instantiation
always yields a draft via `POST /api/workflows` (`fromTemplate`).

## 9. Webhooks (`app/api/workflows/webhooks/route.ts`)

Verified machine callbacks that start runs. HMAC-SHA256 (fail-closed 503
when unconfigured, 401 on bad signature), 4-event allowlist, receipts in
`inbound_webhook_events`. **Tenancy resolves from business keys**
(`employee_id → employees.organization_id`, …) — payload org claims are
never trusted; unresolvable deliveries 200 with `processed: 0`. One run per
matched workflow per delivery fingerprint; redeliveries dedupe without
re-driving. Drives run under `systemDeps` (pinned service store, direct
notify, admin audit, fail-closed tool/proposal stubs) — `tool_call` steps
in system runs fail honestly until a human resumes.

## 10. Surfaces + honestly deferred

**Built UI**: Approval Center (`/approvals`, MANAGER+, Why/Evidence/
Changes/Affected/Reversible cards + frozen-args tool cards, approve/deny
with result states), run detail (`/workflows/runs/:id`, ledger timeline,
cancel/retry), command-center workflows section (pending count for
MANAGER+, recent runs for members).

**Deferred with rationale** (see gap matrix §"Honestly deferred"):
outbound webhook steps (needs an integration allowlist + secret store),
cron auto-retry (no worker session; operator retry only), event-based
waits, manager team-scope task mutation (owner-or-privileged in v1),
full onboarding/offboarding template suites, dual approval.
`docs/AI_ARCHITECTURE.md` never existed — out of scope to invent.

**Pre-existing, untouched**: the visual builder canvas (`/workflows/
builder`) is a local-only draft toy (Save persists nothing) and the legacy
daily-task template system (`workflow_templates`) is a separate surface;
neither is claimed as Phase F functionality.

## 11. Tenancy, RLS, audit

- Org identity always comes from the trusted session (`getRbacContext` /
  `requireOrganizationContext`) or verified business keys — never from AI
  output, clients, or role claims.
- Session store: RLS member-gated on all tables; privilege (HR_ADMIN+ /
  MANAGER+ / initiator-or-privileged / SoD) enforced in routes + executor.
  Service store (`serviceWorkflowStore(pin)`): constructor pin asserted on
  every call + per-query org scoping; webhook drives only.
- Audit: every lifecycle event (`workflow.run.*`, `workflow.approval.*`)
  recorded with org attribution; ledger entries carry codes, never traces;
  tool outputs persisted as `{ok, message}` only (PII minimization).
- Memory store is **test-only** — no production path imports it.

## 12. File map

```
lib/workflows/
  machine.ts        run/step/task transition maps (pure)
  steps.ts          6-type zod vocabulary (pure)
  failures.ts       6-code classifier, backoff, budgets (pure)
  idempotency.ts    deterministic run/step/webhook keys (pure)
  store.ts          WorkflowStore: session baseStore, supabaseWorkflowStore,
                    serviceWorkflowStore(pin), test-only memory store
  executor.ts       driveRun/retryRun/cancelRun/applyApprovalDecision,
                    tool policy, SoD, DriveDeps seam
  runtime.ts        productionDeps(origin, cookie), systemDeps(orgId)
  handler.ts        routeActor/requireRole/canManageRun/mapDriveError,
                    parseApprovalRequest
  templates.ts      3-template executable allowlist
  bridge.ts         instantiateTemplate, insight→template suggestions
app/api/workflows/  14 route handlers (definitions, runs, approvals, webhooks)
app/approvals/      Approval Center (MANAGER+)
app/workflows/runs/[runId]/  run detail + cancel/retry
components/workflows/  approval-card, run-actions (client)
supabase/migrations/20260910000200_phase_f_workflows.sql
tests/unit/workflow*.test.ts  10 suites (machine+keys/steps/executor/
                              routes/handler/tools/bridge/webhooks/
                              migration/task-hardening)
```
