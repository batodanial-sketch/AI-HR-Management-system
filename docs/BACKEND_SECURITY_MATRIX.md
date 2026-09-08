# FLUXENTIQ AI — BACKEND SECURITY MATRIX

**Date:** 2026-09-08 (ultimate audit) · **Branch:** `arena/01a07c94-ai-hr-management-system`
**Status legend:** PASS = verified secure by code audit + tests · FIXED = defect found and fixed (commit) · DESIGN = deliberate, documented behavior · EXTERNAL = requires real infrastructure (BLOCKED_EXTERNAL) · NOT_APPLICABLE = capability intentionally absent (billing, Slack event processing).

| # | Area | Status | Evidence / notes |
|---|---|---|---|
| 1 | Authentication | PASS | Server-side Supabase sessions only; middleware gate; public prefixes self-protect; callback `next` constrained (`safeNext`, `ea2a28d`); SameSite=Lax httpOnly cookies; desktop auth-sync validates bearer against Supabase Auth |
| 2 | Authorization | PASS | Canonical RBAC single definition; module `minRole`; in-route RBAC; duplicate-authz scan 21/21; client roles never trusted |
| 3 | Tenant isolation | PASS | Session-pinned org in every getter/action; bridge tenant from trusted header; RLS 76/76×3 cross-tenant checks |
| 4 | RLS correctness | PASS | 122 tables / 192 policies / 121 RLS-enabled (real PG); canonical membership model; restrictive CLEAN-only file policy; PUBLIC revoked on SECURITY DEFINER RPCs |
| 5 | Privilege escalation | PASS | Canonical role derivation; SCIM role allowlist in SQL (`owner/admin/manager/member`); no user-controlled role writes anywhere |
| 6 | AI model bypass | PASS | Model output → pending proposal only; claim/finish DB-conditional; hash re-verify (TAMPERED); approver pinning; governance re-check at claim |
| 7 | Agent unauthorized execution | PASS | Same machine as #6; `copilot.tool.*` audit per run; budget gate before spend; tool allowlist (`COPILOT_TOOL_NAMES`) |
| 8 | Webhook tenant forgery | PASS | No unsigned tenant authority; provider HMAC/bearer/API-key verification; inbound receipts; SYSTEM audit |
| 9 | Background job cross-tenant | PASS | Scheduler atomic `pending→running` claims; cron org-isolated per row; jobs row-scoped |
| 10 | Storage cross-tenant leak | PASS | Private storage only (no `getPublicUrl`); tenant-keyed object keys (`keyBelongsToTenant`); authorized download RBAC + restrictive RLS |
| 11 | GraphQL exposure | PASS | Query-only; resolvers = org-scoped getters; no mutations; shallow schema |
| 12 | SCIM wrong-tenant provisioning | PASS | Tenant = path segment resolved to verified org; RPC scoped + role allowlist; idempotent upsert |
| 13 | Retry duplication | PASS | Conditional DB transitions (proposals, jobs, invites); `ON CONFLICT` upserts; SCIM/onboarding atomic RPCs |
| 14 | Concurrency corruption | PASS | RLS concurrency section (exactly-one-winner approvals/revocation); conditional UPDATE claims |
| 15 | AI failure state corruption | PASS | Bridge errors → safe 502/error codes; no partial writes without proposal receipts |
| 16 | SSRF | PASS | Scraper scheme/IP/host allowlist fail-closed; bounded timeouts; outbound fetch sweep: all bounded (commits `3c02ca8`, `cccef37`) |
| 17 | Malformed input crash safety | PASS | zod at every boundary; uuid/enum/range validation; **new** integration body cap 413 (this pass); JSON-safe errors |
| 18 | Secrets to clients/logs | PASS | Secret scan 0; publishable-only browser env; scrub module tests; scheduler logs message-only; no secrets in evidence/docs |
| 19 | Failure observability | PASS | Metrics registry + OTLP/Prometheus export; error dedupe/scrub; x-request-id threading; audit org-scoped |
| 20 | Dependency failure recovery | PASS | Fail-closed security paths (scanner/bridge/secrets); bounded retries w/ backoff; health semantics honest (never fake 200) |
| 21 | CSV export injection | FIXED (this pass) | `lib/csv-export.ts` OWASP neutralization; tests `csvExport.test.ts` (5) |
| 22 | Oversized integration bodies | FIXED (this pass) | `lib/http-limit.ts` + middleware 413 cap 5 MB; tests `httpLimit.test.ts` (4) |
| 23 | Unbounded outbound I/O | FIXED (prior pass) | 14 sites bounded (10–150 s); sweep clean |
| 24 | Operator endpoints reachability | FIXED (prior pass) | metrics/cron/workflows-webhooks exempted; handler tokens constant-time fail-closed |
| 25 | CSRF / CORS | PASS | SameSite=Lax; no credentialed cross-origin config; bridge CORS restricted origins, credentials disabled; security headers set (CSP, X-Content-Type-Options, frame-ancestors none, HSTS in prod) |
| 26 | Mass assignment | PASS | zod allowlists; protected fields (org/role/status/audit) never client-writable |
| 27 | Path traversal / upload abuse | PASS | sanitizeFilename + extension/MIME checks + MAX_UPLOAD_BYTES; no object-key traversal |
| 28 | Malware scanning contract | PASS (code) / EXTERNAL (live) | CLEAN-only accept; EICAR/ERROR/TIMEOUT/UNAVAILABLE reject; unit suite storagePipeline 26 |
| 29 | Audit integrity | PASS | audit_logs RLS-isolated; no user write path; SYSTEM actor for machine events |
| 30 | Licensing integrity | PASS | Public-key signature verify; expiry/tier; license never replaces authz |
| 31 | Container/CI hardening | EXTERNAL/ACCEPTED | Remediation documented (pinned digests, USER node, resource limits, SHA-pinned actions); no runtime in sandbox |
| 32 | Replay protection (inbound dispatch webhooks) | ACCEPTED (DESIGN) | HMAC body-only contract (shared with n8n docs); secret holders trusted; deliveries recorded |
| 33 | Seat-capacity race | ACCEPTED (DESIGN) | Read-then-insert overshoot bounded by design; fail-open documented; DB atomicity = future migration |
| 34 | Rate limiting | PASS | Edge categories + org-scoped tier AI limits + bridge tenant limits; no client-IP-only for authenticated paths |
| 35 | Error leakage | PASS | Structured errors; no stack/SQL/env leakage; error-test synthetic event SUPER_ADMIN-only + scrubbed |
| 36 | Health semantics | PASS | liveness vs readiness vs system vs AI-status distinct; smoke 26/26 incl. 503-as-reachable |
| 37 | Billing | NOT_IMPLEMENTED | Product decision; unchanged |
| 38 | Real-infrastructure gates (Supabase/deploy/storage/ClamAV/metrics/alerts/Sentry/AI/bridge/backup) | EXTERNAL | See `docs/PHASE_XI_REPORT.md` gate matrix; egress 000 + no credentials in sandbox |
