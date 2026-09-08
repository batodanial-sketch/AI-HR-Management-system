# FLUXENTIQ AI — BACKEND API INVENTORY

**Date:** 2026-09-08 · **Source:** machine walk of `app/api` (93 `route.ts` handlers) plus the advisory route-classification audit of the backend-completion and ultimate-audit passes.

Every route's security posture is expressed as one **primary protection layer** (legend below). All routes are additionally behind the middleware session/license gate **unless** marked self-authenticating/public, and every database read/write sits behind org-scoped getters + PostgreSQL RLS (final authority).

## Protection layers

| Layer | Routes | Meaning |
|---|---|---|
| `ENCAP` | 50 | Session-gated; input validated in the route, authorization delegated to server actions (`requireOrganizationContext`/role) or org-scoped domain libs (`module-crud` `minRole`, `lib/webhooks`, `lib/notifications`, `lib/api`, `lib/domain`); RLS is the final authority |
| `PUBLIC_SELF` | 13 | Middleware-public by design; self-protects (license key verification, Supabase Auth exchange + callback `next` validation, handler session re-check on `/api/account/delete`, constant-time `METRICS_TOKEN`/`CRON_SECRET`/`WORKFLOW_WEBHOOK_SECRET` checks) |
| `RBAC` | 10 | In-route canonical RBAC (`getRbacContext`/`requireRole`/`requireOrganizationContext`) resolved before any data access; tenant pinned from the session |
| `PROXY` | 9 | Session-gated; authorization centralized in `lib/ai-proxy.ts` (canonical RBAC fail-closed, pilot controls, tier rate limit, org-scoped metering, tenant pinned from session, never from body) |
| `SELF_AUTH` | 11 | Middleware-exempt integration surface; authenticates with its own credential inside the handler (provider HMAC/bearer/API key/desktop token), fail-closed when unconfigured; tenant from bearer binding or path tenant; audited as SYSTEM where applicable |

Aggregate HTTP surface: ~150 exported handlers across the 93 routes (plus Server Actions under `app/actions/*`, the GraphQL endpoint over the same org-scoped getters, and the Python bridge/engine FastAPI surface documented in `bridge/` and `server.py`).

## Route table

| Route | Methods | Layer | Notes |
|---|---|---|---|
| `/api/account/delete` | POST | PUBLIC_SELF | handler re-checks the server session (401 without); admin-client erasure + audit |
| `/api/ai/admin-copilot` | POST | RBAC | enterprise-tier; canonical RBAC in route; bounded bridge round-trip (120 s) |
| `/api/ai/copilot` | POST | RBAC | classic mode → central proxy; agentic mode in-route RBAC + budget + audit; bounded planner (120 s) |
| `/api/ai/engine/[...path]` | GET,POST | PROXY | catch-all engine proxy; per-path body forwarded to bridge with tenant pin |
| `/api/ai/evaluate-candidate` | POST | PROXY | — |
| `/api/ai/evaluate-pto` | POST | PROXY | — |
| `/api/ai/insights` | POST | PROXY | — |
| `/api/ai/interview-report` | POST | PROXY | — |
| `/api/ai/jobs/[jobId]` | GET | ENCAP | session-gated poll; jobId format-validated; bridge secret upstream; 15 s bound |
| `/api/ai/match-candidate` | POST | ENCAP | dormant (no callers); session-gated; external service only if operator configures it; bounded |
| `/api/ai/parse-resume` | POST | PROXY | multipart forwarded to bridge |
| `/api/ai/rank-candidates` | POST | PROXY | — |
| `/api/ai/semantic-search` | POST | ENCAP | dormant (no callers); bounded; never leaks endpoint URL |
| `/api/ai/status` | GET | RBAC | distinct AI-status semantics |
| `/api/ai/test` | POST | PROXY | connection test for settings UI |
| `/api/ai/test-connection` | POST | ENCAP | session-gated; zod-validated; server-side model resolution; keys never from body |
| `/api/assets` | GET,POST | ENCAP | module-crud (`minRole`) |
| `/api/assets/assign` | POST,PATCH | ENCAP | action-guarded; audit rows |
| `/api/attendance/check-in` | POST | ENCAP | action-guarded |
| `/api/attendance/check-out` | POST | ENCAP | action-guarded |
| `/api/auth/login` | POST | PUBLIC_SELF | Supabase Auth exchange; edge auth rate limit 10/min/IP; SameSite=Lax httpOnly cookies |
| `/api/auth/signup` | POST | PUBLIC_SELF | service-role admin used server-side only |
| `/api/auth/sso/callback` | GET | PUBLIC_SELF | standard OAuth exchange |
| `/api/auth/sso/initiate` | POST | PUBLIC_SELF | — |
| `/api/benefits` | GET,POST | ENCAP | module-crud |
| `/api/benefits/enroll` | POST | ENCAP | action-guarded |
| `/api/contractors` | GET,POST | ENCAP | module-crud |
| `/api/contractors/invoices` | POST | RBAC | in-route role check |
| `/api/cron/daily-workflows` | GET,POST | PUBLIC_SELF | `x-cron-secret` constant-time; fail-closed 503 when unset; org-isolated admin inserts |
| `/api/desktop/auth-sync` | POST | SELF_AUTH | bearer validated against Supabase Auth directly |
| `/api/documents` | GET,POST | ENCAP | module-crud (`HR_ADMIN+`) |
| `/api/documents/[id]/content` | GET | RBAC | in-route RBAC + CLEAN-only hand-out policy at DB layer |
| `/api/documents/[id]/download` | GET | RBAC | in-route RBAC + restrictive RLS |
| `/api/documents/[id]/file` | DELETE | RBAC | in-route RBAC |
| `/api/documents/upload` | POST | RBAC | scanned pipeline; size/type/name validation; no public URL |
| `/api/employees` | GET,POST | ENCAP | action-guarded; seat-capacity assertion |
| `/api/employees/[id]` | PATCH | ENCAP | action-guarded (scoped employee access) |
| `/api/equity` | GET,POST | ENCAP | module-crud |
| `/api/equity/grants` | POST | ENCAP | action-guarded |
| `/api/expenses` | GET,POST | ENCAP | module-crud |
| `/api/expenses/receipt-scan` | POST | ENCAP | 503 until OCR worker configured (external) |
| `/api/expenses/submit` | POST | ENCAP | action-guarded |
| `/api/graphql` | GET,POST | ENCAP | query-only, shallow; resolvers = org-scoped getters |
| `/api/health` | GET | PUBLIC_SELF | liveness only |
| `/api/leave/request` | POST,PATCH | ENCAP | action-guarded + DB lifecycle RLS |
| `/api/license/activate` | POST | PUBLIC_SELF | key verified server-side |
| `/api/license/status` | GET | PUBLIC_SELF | instance state |
| `/api/license/sync` | POST | PUBLIC_SELF | — |
| `/api/license/trial` | POST | PUBLIC_SELF | 15-day cookie; no downgrade of paid keys |
| `/api/lms/certifications` | GET | ENCAP | action-guarded |
| `/api/lms/courses` | GET,POST | ENCAP | action-guarded |
| `/api/metrics` | GET | PUBLIC_SELF | disabled 404 unless `METRICS_BACKEND=prometheus`; bearer constant-time |
| `/api/notifications` | GET,POST | ENCAP | session-scoped lib |
| `/api/notifications/stream` | GET | ENCAP | action-guarded |
| `/api/offboarding` | GET,POST,PATCH | ENCAP | module-crud |
| `/api/onboarding/tasks` | GET,PATCH | ENCAP | action-guarded |
| `/api/payroll/calculate` | POST,PATCH | ENCAP | action-guarded |
| `/api/payroll/global-run` | POST | ENCAP | action-guarded |
| `/api/payroll/tax-forms` | POST | ENCAP | 503 until jurisdictional provider configured (external) |
| `/api/performance/ai-summarize` | POST | ENCAP | action-guarded |
| `/api/performance/cycles` | GET,POST,PATCH | ENCAP | module-crud |
| `/api/performance/reviews` | GET,POST | ENCAP | module-crud |
| `/api/planning` | GET,POST | ENCAP | module-crud |
| `/api/predictive/forecast` | POST | ENCAP | action-guarded |
| `/api/recruitment/ai-screen` | POST | ENCAP | action-guarded |
| `/api/recruitment/update-stage` | PATCH | ENCAP | action-guarded |
| `/api/reports` | GET | ENCAP | session-scoped data; export audit; CSV formula-injection neutralized (fix this pass) |
| `/api/scim/v2/[tenantId]/[...segments]` | GET,POST,PATCH,DELETE | SELF_AUTH | per-tenant bearer (`SCIM_TOKEN_<TENANT>` or shared); tenant from path only; canonical role allowlist in SQL; idempotent upsert |
| `/api/screening` | GET,POST | ENCAP | module-crud |
| `/api/settings` | GET,PUT | ENCAP | instance-level settings (documented design); mode 0600 writes |
| `/api/settings/ai-budget` | GET,PATCH | RBAC | in-route role check |
| `/api/settings/memory/test` | POST | ENCAP | session-gated connection test |
| `/api/surveys` | GET,POST | ENCAP | module-crud |
| `/api/surveys/ai-analysis` | POST | ENCAP | 503 until server AI configured (external) |
| `/api/surveys/submit` | POST | ENCAP | action-guarded |
| `/api/system/cron` | GET | ENCAP | middleware-exempt operator endpoint; `x-cron-secret` constant-time; fail-closed |
| `/api/system/error-test` | POST | RBAC | SUPER_ADMIN-only synthetic event, tagged `[SYNTHETIC]`, scrubbed |
| `/api/system/health` | GET | ENCAP | session-gated detailed subsystem status |
| `/api/system/ready` | GET | ENCAP | session-gated readiness incl. bounded bridge probe |
| `/api/team/capacity` | GET | ENCAP | seat capacity via session-scoped lib |
| `/api/tenant/settings` | PATCH | ENCAP | action-guarded org config |
| `/api/webhooks` | GET,POST | ENCAP | under middleware-exempt prefix but session-protected inside (`lib/webhooks` → `getCurrentUser`, org-pinned) |
| `/api/webhooks/[id]` | DELETE | ENCAP | same pattern; org-pinned delete |
| `/api/webhooks/external/inbound-lead` | POST | SELF_AUTH | `leads:write` API key; org from key; receipt + audit |
| `/api/webhooks/external/outbound-trigger` | POST | SELF_AUTH | admin session + HMAC outbound; bounded 10 s |
| `/api/webhooks/inbound/[provider]` | GET,POST | SELF_AUTH | provider signature verification; production fail-closed; receipts in `inbound_webhook_events` |
| `/api/webhooks/n8n-trigger` | POST | SELF_AUTH | HMAC-SHA256 constant-time |
| `/api/webhooks/outbound` | POST | SELF_AUTH | dispatch gateway; HMAC + optional session |
| `/api/webhooks/python-bridge` | POST | SELF_AUTH | constant-time bridge secret; 503 when unconfigured |
| `/api/webhooks/python-callback` | POST | SELF_AUTH | re-export of python-bridge handler |
| `/api/webhooks/slack/events` | POST | SELF_AUTH | signature-verified; deny-by-default (no event processing implemented) |
| `/api/workflows/trigger` | POST | PROXY | — |
| `/api/workflows/webhooks` | POST | PUBLIC_SELF | `WORKFLOW_WEBHOOK_SECRET` HMAC constant-time; 401 fail-closed |

## Cross-cutting notes

- **Tenant rule (all routes):** tenant is derived from the authenticated session (canonical `memberships`), from a verified bearer binding (SCIM/inbound webhooks), or from an operator secret — never from a client body/query claim. Bridge-bound AI requests pin `X-Organization-Id` from the session.
- **Input validation:** zod schemas at every route/action boundary; uuid/date/enum/range validation; allowlist model/enum catalogs for AI paths.
- **Audit:** security-sensitive mutations emit `audit_logs` rows (org-scoped, RLS-protected, SYSTEM actor for machine events); reports and webhook receipts are audited.
- **Idempotency:** DB conditional transitions for proposals/approvals/jobs; upserts for invites, SCIM, workflow tasks; atomic bootstrap/seat logic where applied.
- **Error behavior:** structured JSON errors; 400/401/403/404/409/413/429/502/503 classes used; no stack traces or secrets in responses; `x-request-id` threaded and echoed.
