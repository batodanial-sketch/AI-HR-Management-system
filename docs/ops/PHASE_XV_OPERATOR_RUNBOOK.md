# FLUXENTIQ AI — PHASE XV OPERATOR RUNBOOK

**Date:** 2026-09-09 · **Release to deploy:** `4368523261e0472cbbc059bafd54926b0fa1dcfb` (`4368523`) · **Branch:** `arena/01a07c94-ai-hr-management-system` (Next.js 15.5.25 standalone, React 18)
**Status:** NO PRODUCTION ENVIRONMENT PROVISIONED. This runbook is the complete operator activation sequence. **No secrets here** — only variable **names** and commands. Each row: `OPERATOR ACTION | AUTOMATED VERIFICATION | EXPECTED RESULT | EVIDENCE LOCATION | FAILURE CONDITION`.

Secret values live ONLY in the deployment platform's secret store / provider dashboards — never in git, reports, evidence, or chat. After every milestone, re-run the evidence generator (§11) so gate statuses derive from real execution.

---

## 0. Secret inventory (names only — from `.env.example`)

| Category | Variable names |
|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF`, `DATABASE_URL` |
| AI + bridge | primary provider key + model/URL vars (per `.env.example`), backup provider key vars, `AI_BRIDGE_URL`, `BRIDGE_SECRET_KEY` |
| Observability | error-tracking DSN var, metrics/OTLP endpoint + headers/token, alert channel token/URL |
| Email | relay API key / SMTP creds, verified sender |
| Integrations | `N8N_WEBHOOK_SECRET`, `PYTHON_BRIDGE_WEBHOOK_SECRET`, `WORKFLOW_WEBHOOK_SECRET`, `SLACK_SIGNING_SECRET`, SCIM tokens (per-tenant), `CRON_SECRET`, `METRICS_TOKEN` |
| Platform | `PILOT_BASE_URL`, `PILOT_DEPLOYMENT_ID` |

## 1. Secret delivery + Supabase

| OPERATOR ACTION | AUTOMATED VERIFICATION | EXPECTED RESULT | EVIDENCE LOCATION | FAILURE CONDITION |
|---|---|---|---|---|
| Create Supabase org + project (dashboard) | `curl -sI https://<ref>.supabase.co/auth/v1/health` | HTTP 200 | operator checklist item | project unreachable → BLOCKED_EXTERNAL |
| Store URL/keys in the platform secret store (never git) | secret scan (`scripts/preflight.sh` Gate 7) | 0 hits | preflight log | any committed secret → STOP, rotate, document |
| Push migrations via the project's migration mechanism (`supabase/migrations/`, 36 files; no manual schema edits) | `node scripts/phase-w-evidence.mjs` (Phase S gates: migration order, schema hash, RLS suite) | migrations applied; schema hash matches; **RLS 76/76 ×3** | `docs/generated/phase-s-evidence.json` | migration failure/partial schema → FAIL, stop pilot |
| Create controlled test tenants (synthetic data only) | RLS suite cross-tenant checks (A→B SELECT/INSERT/UPDATE/DELETE/RPC/storage/audit) | A→A allowed; A→B **DENIED** everywhere | RLS evidence + `docs/PHASE_XV_REPORT.md` §9 | any tenant escape → **CRITICAL FAIL**, stop pilot |
| Enable auth methods (email/magic-link/SSO per product scope) | signup → login → logout → refresh → expired/invalid session tests | unauthenticated denied; wrong-role denied; right-role allowed; no open redirect (`safeNext`) | auth gate evidence | auth bypass → CRITICAL FAIL |

## 2. HTTPS hosting deployment

| OPERATOR ACTION | AUTOMATED VERIFICATION | EXPECTED RESULT | EVIDENCE LOCATION | FAILURE CONDITION |
|---|---|---|---|---|
| Deploy **exactly commit `4368523`** (not `main`, not latest, not uncommitted code) on Vercel/Render/Railway/Fly | platform deployed-commit field == `4368523` | SHA equality | `docs/PHASE_XV_REPORT.md` §6 | SHA mismatch → `RELEASE_BLOCKED`; never claim PASS |
| Set all §0 secrets in the platform store | `curl -sI https://<app>/api/health`; `/api/system/health` without session | health 200; system health 401/503 (distinct semantics, never all-200) | smoke evidence | wrong statuses → investigate before proceeding |
| Verify HTTPS/TLS/headers | browser/curl cert chain, HSTS/CSP/frame/MIME/referrer headers | valid cert, correct hostname, redirect to HTTPS | §18 report row | TLS defect → FAIL |

## 3. Post-deployment smoke (after EVERY deployment)

| OPERATOR ACTION | AUTOMATED VERIFICATION | EXPECTED RESULT | FAILURE CONDITION |
|---|---|---|---|
| Exercise `GET /`, login, protected route, dynamic route, GraphQL, webhook, SCIM, desktop endpoint | local smoke script pattern (see `docs/PHASE_XIV_REPORT.md` §19) | appropriate HTTP per class; malformed input → 4xx/503, never 500 crashes | 500 on valid/malformed input → real defect → §10 change discipline |
| Oversized bodies (webhook/SCIM/desktop, >5 MB) | curl `--data-binary` 5.6 MB POST | **HTTP 413** | no 413 → U2 regression → FAIL |
| CSV export with `=`, `+`, `@`, negative numbers | export → inspect CSV | formulas neutralized; negatives preserved | injection visible → U1 regression → FAIL |
| Unconfigured inbound webhook | POST valid-shaped event | fail-closed 503 (never 200 without secrets) | 200 → webhook security regression → CRITICAL |
| Representative routes per class (ENCAP/PUBLIC_SELF/SELF_AUTH/RBAC/PROXY) | `docs/API_INVENTORY.md` class checks | matches audited classification | mismatch → FAIL + document |

## 4. Secondary services (progressive — only if provisioned)

| Service | OPERATOR ACTION | VERIFICATION + EXPECTED | FAILURE CONDITION |
|---|---|---|---|
| Storage | create private buckets via migrations; tenant-scoped keys | authorized upload/download OK; cross-tenant download **DENIED**; no public URLs | cross-tenant read → CRITICAL |
| ClamAV | deploy scanner; set URL env | clean → accepted; EICAR → rejected; scanner down → fail-closed reject | fail-open → CRITICAL |
| AI primary | store provider key | one controlled real prompt: real response; usage/cost accounted; key never in browser/logs | mock/no response → investigate; no fabricated evidence |
| AI backup | store backup-provider key | forced primary 429/5xx/timeout → backup succeeds; both fail → safe error | fallback bypasses tenant/authz/audit → CRITICAL |
| Bridge | deploy `bridge/`+`python_engine/` privately; set `BRIDGE_SECRET_KEY` both sides | valid secret OK; missing/invalid secret denied; SSRF attempts blocked; client-supplied tenant never trusted | bridge = authz bypass or SSRF → CRITICAL |
| Email | relay creds + verified sender | controlled-recipient delivery; SPF/DKIM/DMARC records; recipients server-derived | arbitrary recipient control → FAIL |
| n8n/webhooks | partner workflows + shared secrets | valid signature → processed once; invalid/missing → rejected; **replay → no duplicate side effect**; oversized → 413; receipt persisted | replay duplication → CRITICAL |
| Scheduler | cron host hitting cron endpoints with `CRON_SECRET`/`METRICS_TOKEN` | scheduled runs; duplicate prevented (atomic DB claims); unauthenticated trigger denied | duplicate execution / unauthorized trigger → FAIL |
| Metrics/alerting/error tracking | OTLP endpoint/token; alert channels; DSN + release `4368523` | request → metric; controlled error → tracker; **trigger one controlled alert → delivery → receipt → resolution** | silent failure; secrets in telemetry → FAIL |
| Backups | enable provider backups (schedule/retention per policy) | backup completes; ID/timestamp/size recorded | no backup → BLOCKED_EXTERNAL, not PASS |

## 5. Restore drill

| OPERATOR ACTION | VERIFICATION | EXPECTED RESULT | FAILURE CONDITION |
|---|---|---|---|
| Restore newest backup into an ISOLATED environment (never over production) | schema/data/constraints/functions/triggers/indexes/RLS re-verification via evidence generator | **76/76 RLS after restore**; row counts match | restore failure → FAIL (mandatory recovery path) |
| Point a temporary app env at the restore environment; run §3 smoke | health + core flows | PASS | app can't connect → investigate |
| Record backup ID, restore timestamp, environment, release SHA | evidence artifact | complete record | missing record → re-drill |

## 6. Rollback

| OPERATOR ACTION | VERIFICATION | EXPECTED RESULT | FAILURE CONDITION |
|---|---|---|---|
| Redeploy previous audited release (`b8ad726` = pre-Next-15; current = `4368523`) | schema parity before traffic; §3 smoke | health + core flows PASS | DB incompatibility → stop; no destructive DB rollback |

## 7. Incident response (operator answers)

1. App up? `/api/health`. 2. DB healthy? `/api/system/ready` + provider dashboard. 3. Bridge/AI? `/api/ai/status`. 4. Email/webhooks/jobs? dashboards + tenant-scoped `audit_logs` + receipts. 5. Backups? provider UI + alert receipts. 6. Tenants isolated? re-run RLS suite; any escape = CRITICAL (stop, preserve evidence, fix via §10). 7. Release deployed? platform deployed-commit == `4368523`. 8. Escalate via repo issue with phase/gate/evidence paths — never secrets.

## 8. Known limitations (pilot scope)

Billing `NOT_IMPLEMENTED` (out of scope) · in-process scheduler until cron host exists · seats soft-enforced · inbound-dispatch webhooks use body-HMAC without timestamp window (documented contract) · container hardening (non-root, pinned digests, resource limits — audit U7) applies at deploy time · AI prompts carry feature payloads only · non-Supabase memory adapters single-tenant by assumption.

## 9. Change discipline (only if a real defect appears)

REPRODUCE → ROOT CAUSE → MINIMAL FIX → REGRESSION TEST → FULL VALIDATION → COMMIT → NEW AUDITED SHA (state clearly the old SHA is superseded) → REDEPLOY → RE-VERIFY. Never hot-patch production. No speculative refactors, no dependency churn, no threshold changes, no test deletions.

## 10. Required configuration without secrets (verification)

```text
curl -sI https://<ref>.supabase.co/auth/v1/health        # 200
curl -sI https://<app>/api/health                        # 200
curl -sI https://<app>/api/system/health                 # 401/503 unauthenticated
platform "deployed commit" == 4368523
```

## 11. Evidence generation (after EVERY milestone)

```text
PATH="$PWD/.venv/bin:$PATH" CI=1 \
DATABASE_URL=<restore-safe-db-url> \
PG_TOOLS_BIN=<pg-native-bin-dir> \
node scripts/phase-w-evidence.mjs
node scripts/phase-{s,t,u,v,w}-evidence.mjs --verify    # all exit 0 required
```

Gate statuses derive from execution only — never edit generated evidence.
