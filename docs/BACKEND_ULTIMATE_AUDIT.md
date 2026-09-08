# FLUXENTIQ AI — ULTIMATE BACKEND AUDIT

**Date:** 2026-09-08 (ultimate audit pass over the phase-advisory final state)
**Branch:** `arena/01a07c94-ai-hr-management-system` · HEAD before pass: `b83ebd9`
**Method:** fresh inspection of the repository (not a replay of prior reports): route walk of `app/api` (93 handlers) + `app/actions/*`, `lib/*` (67 modules), `middleware.ts`, `supabase/migrations` (36), `bridge/*` + `server.py` + `python_engine/*`, `src/*` legacy tree, `electron-app/*`, `.github/workflows/ci.yml`, Dockerfiles, `.env.example`, tests, and the phase evidence chain.

---

## 1. Architecture (verified, unchanged)

Clean layered backend (route/action → middleware gate → canonical RBAC → service/domain libs → org-scoped data access → RLS) with a Python AI bridge behind a fail-closed secret gate. Authorization primitives have exactly one production definition (`lib/authz/*`; duplicate-authz scan 21/21). No layer duplications, god modules, or circular imports were introduced or found that justify refactoring; the module-crud/action/library encapsulation pattern is consistent across all 93 routes (see `docs/API_INVENTORY.md`).

## 2. Findings register

Severity scale: **P0** critical security/data integrity · **P1** production correctness · **P2** reliability/defense-in-depth · **P3** performance · **P4** maintainability. Status: `FIXED` (this pass or an earlier audited pass), `VERIFIED` (audited clean), `DESIGN` (deliberate, documented), `EXTERNAL` (infrastructure-bound), `ACCEPTED` (residual risk recorded).

| # | Sev | Area | Finding | Status | Disposition / evidence |
|---|---|---|---|---|---|
| U1 | P2 | Report exports | CSV cells beginning `= + @ tab CR` (or formula-dash `-2+3`) were exported unescaped → spreadsheet formula injection via org-controlled fields (names, emails, lead data) when opened in Excel/Sheets | **FIXED this pass** | New pure `lib/csv-export.ts` (OWASP neutralization, negative numeric literals preserved) used by `lib/reports.ts`; regression suite `tests/unit/csvExport.test.ts` (5 tests) |
| U2 | P2 | Webhook/desktop/SCIM surface | Raw request bodies read without a size cap on 4+ integration routes → oversized-payload memory abuse before signature verification | **FIXED this pass** | `lib/http-limit.ts` (`INTEGRATION_BODY_LIMIT_BYTES` = 5 MB) enforced centrally in `middleware.ts` for `/api/webhooks/`, `/api/desktop/`, `/api/scim/` (413 before buffering); regression suite `tests/unit/httpLimit.test.ts` (4 tests) |
| U3 | P3 | Performance | Org list endpoints return full org datasets without server-side pagination; PostgREST default row caps apply at scale | ACCEPTED | Pilot-scale org data; no unbounded cross-org queries (all org-filtered). Documented; pagination is the operator-scale follow-up |
| U4 | P3 | GraphQL | Query-only, shallow (≤3 levels), resolvers delegate to org-scoped getters; no mutation surface; no depth/complexity plugin | VERIFIED | Depth/complexity plugins would add a dependency for a schema with no nested user-controlled fan-out; documented decision |
| U5 | P2 | SCIM | Bearer token per tenant (`SCIM_TOKEN_<TENANT>`) plus optional shared `SCIM_BEARER_TOKEN`; shared token can provision into any tenant whose slug is known | DESIGN | Operator choice (least-privilege guidance in env docs: use per-tenant tokens). Provisioning itself is canonical: SQL role allowlist (`owner/admin/manager/member`), idempotent upsert, deactivate = membership delete, SYSTEM audit |
| U6 | P2 | Webhooks | Inbound dispatch signature is HMAC(body) without a timestamp/replay window | ACCEPTED | Contract shared with n8n documentation; secret holders are trusted operator services; deliveries recorded for audit. Changing the contract would break the documented integration |
| U7 | P2 | Containers | Root Dockerfiles use floating base tags (`node:20-alpine`, `python:3.11-slim`, `python:3.12-slim`) and run as root; no resource limits | EXTERNAL (operator) | No container runtime in this environment to validate changes; exact remediation documented (pin digests, `USER node`, read-only fs, drop caps) — see §6 |
| U8 | P3 | CI | GitHub Actions pins action majors (`@v4`) without commit-SHA pinning; `ubuntu-latest` floating | ACCEPTED | Top-level `permissions: contents: read` least-privilege is present; fork PRs get no secrets. SHA-pinning is the hardening follow-up |
| U9 | P3 | Seat capacity | `assertSeatCapacity()` is read-then-insert; concurrent creates can overshoot the cap by the number of concurrent callers | ACCEPTED/DESIGN | Deliberate fail-open, soft enforcement documented in `lib/seats.ts`; overshoot blocks subsequent creates (informational tiers). DB-side atomic seat RPC would need a new migration — recorded, not introduced speculatively |
| U10 | P2 | Scheduler | Job claim is atomic (`pending→running` conditional update with `locked_by`) — no duplicate run | VERIFIED | `lib/scheduler.ts` race-condition fix present; completed/failed transitions recorded |
| U11 | P2 | License | Paid keys verified with node:crypto public-key signature; trial is local expiring state; license never substitutes for authorization | VERIFIED | `lib/license.ts`; middleware gate is cookie-lite, server re-verifies |
| U12 | P1 | Auth callback | Post-auth `next` redirect parameter could shape Location with scheme-relative/backslash values | FIXED (earlier audited pass) | `safeNext()` local-path constraint (`app/auth/callback/route.ts`, commit `ea2a28d`) |
| U13 | P1 | Outbound I/O | 14 server-side fetch sites had no timeout | FIXED (earlier audited pass) | commits `3c02ca8`, `cccef37`; sweep confirms zero unbounded server fetches |
| U14 | P2 | Operator endpoints | `/api/metrics`, `/api/system/cron`, `/api/cron/*`, `/api/workflows/webhooks` unreachable past the session gate for cookie-less callers | FIXED (earlier audited pass) | middleware exemption + handler-level constant-time credentials; live-verified fail-closed |
| U15 | P2 | Bridge/SSRF | Python engine scrapers: scheme allowlist, private/loopback/link-local/reserved IP blocked, host allowlist fail-closed, bounded urllib/httpx timeouts, byte caps | VERIFIED | `python_engine/scraper.py`, providers 90 s/15 s connect |
| U16 | P1 | Proposal/agent | claim = conditional DB update (`pending` + unexpired); finish pinned to claiming `auth.uid()`; arguments hash re-verified; PUBLIC revoked, `authenticated` only | VERIFIED | migration `20260907000100`; RLS 76/76×3 + proposalLifecycle 11 |
| U17 | P2 | Multi-tenancy | All getters org-filter from session; no client tenant claims trusted anywhere (incl. AI context, webhook payloads, SCIM path resolved to org then RPC-scoped) | VERIFIED | audit of `lib/api`, `lib/domain`, `lib/webhooks`, `lib/scim/provisioning`, bridge `_org_id_from_request` |
| U18 | P2 | Audit | audit rows org-scoped + RLS; actor/action/result/request-id captured; no secrets/PII in messages (scheduler logs message-only) | VERIFIED | DATA_FLOW_AUDIT update (§5) |
| U19 | P3 | Dependencies | npm packages use `^` ranges (reproducible via lockfile); no `latest` tags; no abandoned/duplicate libs found; native better-sqlite3 pinned by lockfile; Python reqs pinned | VERIFIED | `npm ci` deterministic; `package-lock.json` + `requirements.txt` |
| U20 | P2 | Config | `.env.example` documents 36 vars incl. required secrets with fail-closed semantics; only `NEXT_PUBLIC_*` (publishable) reach browsers; example contains localhost **dev defaults only**, commented as such | VERIFIED | see §4 classification summary |
| U21 | P2 | Electron | Desktop shell reads only `NEXT_PUBLIC_*`; no secrets in IPC/main | VERIFIED | `electron-app/src/main.ts` |
| U22 | P2 | Health | `/api/health` (liveness) vs `/api/system/health`/`/api/system/ready` (session-gated detail) vs `/api/ai/status` — semantics distinct, never all-200 | VERIFIED | phase audits + smoke 26/26 |
| U23 | P1 | Authz duplication | One production definition per primitive; no consumer bypasses it; no fail-open patterns | VERIFIED | `authz-duplicate-check.mjs` 21/21 |
| U24 | P2 | Placeholders | Keyword sweep (stub/placeholder/fake/temporary/mock/NotImplemented/console.log/debug/bypass/skip/disabled/hardcoded) → zero unexplained production hits | VERIFIED | ledger in §7 |
| U25 | P2 | Secrets | Scan patterns 0 hits over full source; no credential in env; no secret in docs/evidence; git history clean of secret material introduced by any pass | VERIFIED | gate 7 + independent re-run |
| U26 | P2 | Error model | 400/401/403/404/409/413/429/502/503 classes; no stack/SQL/secret leakage; x-request-id threading | VERIFIED | code audit + error-test route |
| U27 | P2 | Inbound webhooks | Production fail-closed (503) when provider secrets unconfigured; receipts stored; processed flag; SYSTEM audit | VERIFIED | `webhooks/inbound/[provider]` |
| U28 | P3 | Notification/email | Recipients server-derived; console mode logs subject only (no PII); bounded relay (15 s); no client-forced recipients on system paths | VERIFIED | `lib/email.ts`, `lib/notifications.ts` |
| U29 | P3 | Rate limiting | Edge shield categories (auth/webhook/copilot/module) + server-side org-scoped tier limits + bridge-side tenant limits | VERIFIED | `middleware.ts`, `lib/rate-limit.ts`, `server.py` |
| U30 | P2 | Data-flow privacy | Browser→Next→Supabase/Storage→bridge→provider→email/webhooks/logs/observability; minimization: no secrets to LLM, prompt content limited to feature payloads, scrubbing on capture | VERIFIED | DATA_FLOW_AUDIT update (§5) |

## 3. Fixes made in this pass

1. **U1 — CSV formula injection (P2):** added `lib/csv-export.ts` with `csvEscape`/`toCsv` (OWASP neutralization: leading `= + @ tab CR` and non-numeric `-` prefixed with `'`; negative numeric literals preserved); `lib/reports.ts` now uses it. Regression tests: `tests/unit/csvExport.test.ts` (5 tests).
2. **U2 — Integration body-size cap (P2):** added `lib/http-limit.ts`; `middleware.ts` rejects webhook/desktop/SCIM requests advertising `content-length > 5 MB` with 413 before buffering. Regression tests: `tests/unit/httpLimit.test.ts` (4 tests).

Both changes are behavior-preserving for legitimate traffic (limits far above real payloads), typecheck/lint clean, and covered by unit tests.

## 4. Configuration classification summary

Required secrets (fail-closed when unset, server-only): `SUPABASE_URL`+`SUPABASE_SECRET_KEY` (or publishable key for sessions), `BRIDGE_SECRET_KEY`, `AI_BRIDGE_URL`, `LLM_API_KEY`/provider keys, `CRON_SECRET`, `METRICS_TOKEN`, `ERROR_TRACKING_DSN`/webhook, webhook signing secrets (`N8N_WEBHOOK_SECRET`, `PYTHON_BRIDGE_WEBHOOK_SECRET`, `WORKFLOW_WEBHOOK_SECRET`, `SLACK_SIGNING_SECRET`), SCIM tokens, `EMAIL_HTTP_URL`. Required non-secret: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Optional: metrics/OTLP endpoint+headers, scanner URL, scraping allowlist, `AI_KILL_SWITCH`, budget vars, allowed origins. Development-only: `EMAIL_PROVIDER=console`, localhost bridge defaults in `.env.example` (documented dev defaults; production activation requires real URLs). No test credentials or placeholders exist in committed env files; `.env.example` holds names only.

## 5. Data-flow/security map (update)

See `docs/DATA_FLOW_AUDIT.md` — appended "Ultimate audit update" section recording: current component data-flow (Browser → Next.js → Supabase PostgREST/Auth/Storage; Next.js → Python bridge → provider; Next.js → email relay/webhooks; bridge → Supabase usage/telemetry), PII exit points (auth provider, LLM provider via feature prompts, email relay, subscriber webhooks, observability backends), and controls per edge (tenant pinning, scrubbing, bounded timeouts, audit). No new data exit points were introduced by this pass.

## 6. Remaining external blockers (infrastructure-bound, unchanged)

Supabase project (auth/Postgres/RLS/storage) · HTTPS deployment · ClamAV scanner · metrics backend · alerting · error tracking (Sentry) · AI provider + bridge deployment · provider backup/restore. Container hardening (U7) is an operator task pending a container runtime. All are recorded with per-gate remediation in `docs/PHASE_XI_REPORT.md` and the operator checklist; egress probes from this environment remain `000` for all providers.

## 7. Remaining placeholders/stubs (final ledger)

None in production code that are unexplained. Intentional/classified: demo-mode seed fallbacks (`lib/data.ts`, proposal demo store, font stub) · documented 503 capability stubs (`payroll/tax-forms`, `expenses/receipt-scan`, `surveys/ai-analysis`) · dormant AI surfaces (`match-candidate`, `semantic-search`) · Slack-events deny-by-default placeholder (feature not implemented in product scope) · `console.error` message-only scheduler logging · inline `eslint-disable no-var` global-singleton declaration (documented) · two environment-conditioned Playwright `test.skip` (documented).

## 8. Validation (this pass, final code state)

| Gate | Result |
|---|---|
| Jest | **105/105** (10 suites — 96 baseline + 9 new regression tests: csvExport 5 + httpLimit 4) |
| pytest | 15/15 (unchanged) |
| tsc --noEmit | 0 errors |
| eslint (changed files + full preflight) | 0/0 |
| RLS suite (real PG 18.4) | 76/76 ×3 (rerun at evidence regeneration) |
| authz-dup | 21/21 |
| secret scan | 0 |
| preflight | 8/8 (incl. production build) |
| Evidence verifiers | exit 0 at the new anchor (regenerated) |

## 9. Answers to the §93 questions (summary)

1–4. Authentication/authorization/tenancy/RLS: secure and enforced at session + canonical-membership + org-scoped-getter + RLS layers; forged values never trusted (evidence: 76/76×3 RLS, 21/21 dup-authz, route taxonomy). 5. Privilege escalation: no path found (canonical role derivation; SCIM allowlist; module minRole; error-test SUPER_ADMIN-gated). 6–7. AI/agent bypass: impossible by construction — model output only creates pending proposals; claim/finish are DB-conditional with role re-check, approver pinning, hash re-verification. 8. Webhook tenant forgery: unsigned payloads carry no tenant authority; tenant comes from verified bearer/secret or session; receipts audited. 9. Cross-tenant background jobs: cron iterates orgs via admin client but inserts are org-isolated per row (RLS `is_org_member` semantics); scheduler claims are org-scoped rows. 10. Storage cross-tenant leaks: private-only, tenant-keyed object names, restrictive CLEAN-only hand-out policy. 11. GraphQL: no unauthorized exposure (org-scoped resolvers, no mutations). 12. SCIM wrong-tenant provisioning: tenant resolved from path → verified org; RPC scoped to that org. 13. Retry duplication: conditional DB transitions + upserts prevent double effects. 14. Concurrency corruption: exactly-one-winner transitions (RLS concurrency suite). 15. AI failure corruption: bridge failures map to safe errors; no state mutation without proposal. 16. SSRF: allowlist + IP-blocking + bounded timeouts on scraper/bridge; outbound fetches all bounded. 17. Malformed input crashes: zod everywhere; bounded bodies (new 413 cap); JSON-safe errors. 18. Secrets to clients/logs: none (scan 0; scrub tests; publishable-only browser env). 19. Failure observability: metrics/error/audit surfaces + x-request-id. 20. Dependency-failure recovery: fail-closed security paths; bounded retries; health semantics honest. 21. Production stubs: zero unexplained (ledger above). 22. Tests proving security properties: RLS/tenant/lifecycle/concurrency/proposal suites + new CSV/body-cap suites assert invariants, not coverage. 23. Genuinely blocked by external infrastructure: §6 list — only those.

## 10. Verdict

**`BACKEND IMPLEMENTATION COMPLETE`** (no known P0/P1 defect remains; two P2 defense-in-depth fixes landed this pass with regression tests). Overall system verdict unchanged and regenerated by the authoritative generator:

**`PRODUCTION PILOT READY — EXTERNAL INFRASTRUCTURE STILL BLOCKED`** · Billing `NOT_IMPLEMENTED`.
