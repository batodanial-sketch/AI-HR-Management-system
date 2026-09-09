# FLUXENTIQ AI — PHASE XIV OPERATOR RUNBOOK

**Date:** 2026-09-09 · **Applies to release:** `4368523261e0472cbbc059bafd54926b0fa1dcfb` (`4368523`; canonical branch `arena/01a07c94-ai-hr-management-system`; Next.js 15.5.25, standalone output)
**Status:** NO PRODUCTION ENVIRONMENT PROVISIONED — this runbook is the operator's definitive activation procedure. **It contains no credentials** — only variable **names**, commands, and verification steps. After each milestone, re-run the official evidence generator so gate statuses derive from real execution.

---

## 1. Production identity (fill during provisioning)

| Field | Value |
|---|---|
| Production URL | `https://<pilot-host>/` (assigned by hosting platform) |
| Deployed release SHA | `4368523261e0472cbbc059bafd54926b0fa1dcfb` (verify platform "deployed commit" == this SHA) |
| Supabase project ref | `<ref>.supabase.co` |
| Bridge URL | `https://<bridge-host>/` (private) |
| Evidence anchor | `docs/PHASE_XIV_REPORT.md` §Evidence Chain |

## 2. Secret inventory (names only — values live in the platform secret store, never in git/evidence/chat)

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF`, `DATABASE_URL`
- **AI + bridge:** primary provider key var(s) + model/URL vars, backup provider key var(s), `AI_BRIDGE_URL`, `BRIDGE_SECRET_KEY`
- **Observability:** error-tracking DSN, metrics endpoint + headers/token (OTLP), alert channel token/URL
- **Email:** relay API key/SMTP credentials, verified sender address
- **Integrations:** `N8N_WEBHOOK_SECRET`, `PYTHON_BRIDGE_WEBHOOK_SECRET`, `WORKFLOW_WEBHOOK_SECRET`, `SLACK_SIGNING_SECRET`, SCIM tokens (per-tenant preferred), `CRON_SECRET`, `METRICS_TOKEN`
- **Platform:** `PILOT_BASE_URL`, `PILOT_DEPLOYMENT_ID`
- Full documented set with fail-closed semantics: `.env.example`.

## 3. Activation order and verification

1. **Supabase project.** Create org + project at supabase.com/dashboard. Apply migrations only via the project's migration mechanism (`supabase/migrations/`, 36 files — never hand-edit schema).
   - Verify: `curl -sI https://<ref>.supabase.co/auth/v1/health` → 200; re-run the evidence generator (Phase S gates include migrations, schema hash, RLS 76/76).
2. **Hosting deployment.** Deploy **exactly commit `4368523`** of `batodanial-sketch/AI-HR-Management-system` (Next.js 15.5.25, standalone — preflight Gate 3/4). Set all secrets in the platform store.
   - Verify: platform reports deployed commit `4368523`; `curl -sI https://<app>/api/health` → 200; `https://<app>/api/system/health` → 401 without session (semantics must stay distinct); exercise §7 smoke list.
3. **Python bridge.** Deploy `bridge/` + `python_engine/` (Python 3.11+, `python_engine/requirements.txt`) as a private service; set `BRIDGE_SECRET_KEY` identically app-side and bridge-side; keep the SSRF allow-list intact.
   - Verify: `/api/ai/status` reflects bridge; tenant identity arrives from the trusted request context (never from model/client).
4. **AI primary + backup.** Store provider keys; verify one controlled prompt per provider; force primary 429/5xx/timeout and confirm the fallback ladder preserves tenant/authz/usage/audit.
5. **Storage + ClamAV.** Private buckets via migrations; tenant-scoped object keys. Provision ClamAV and set its URL env var.
   - Verify: clean file accepted; EICAR artifact rejected; scanner-down path fail-closed (CLEAN-only).
6. **Email.** Configure relay + verified sender; keep `EMAIL_PROVIDER` off `console`; send only to controlled recipients; verify SPF/DKIM/DMARC records.
7. **n8n / webhooks.** Create inbound workflows; set shared signing secrets (app enforces HMAC verification + 5 MB body cap — `middleware.ts`/`lib/http-limit.ts`).
   - Verify: valid event processed once; **replay identical payload → no duplicate side effect**; oversized → 413.
8. **Cron.** Point the platform scheduler at cron endpoints with `CRON_SECRET`/`METRICS_TOKEN` headers (scheduler claims are atomic DB transitions; duplicate execution prevented).
9. **Metrics/alerting/error tracking.** Set OTLP endpoint/token, alert channels, error-tracking DSN + release `4368523`. Create the minimum alert set: 5xx spike · DB failure · AI failure · bridge failure · webhook failure · job failure · backup failure · scanner failure · auth abuse. Trigger one controlled alert and verify TRIGGER → DELIVERY → RECEIPT → RESOLUTION.
10. **Backups.** Enable Supabase backups (schedule/retention per policy); then perform §5 restore drill.

## 4. Health checks (live after deployment)

| Check | Endpoint | Expect |
|---|---|---|
| Public liveness | `/api/health` | 200 (no details/secrets) |
| Session-gated detail | `/api/system/health`, `/api/system/ready` | 401 unauthenticated / 200 with session |
| AI/bridge status | `/api/ai/status` | distinct from liveness |
| Deployment SHA | hosting platform UI/API | `4368523` |

The four endpoints must keep distinct semantics (never all-200) and never leak env vars/credentials/topology.

## 5. Restore procedure (controlled drill — never over production)

1. Select the newest completed backup; record backup ID + timestamp.
2. Restore into a fresh restore environment (new Supabase project or ephemeral Postgres).
3. Re-run schema parity + RLS: the evidence generator executes the 76/76 RLS restoration checks; expect 76/76.
4. Point a temporary app env at the restore environment; run the §7 smoke list.
5. Record: backup identifier, restore timestamp, restore environment, release SHA, result. Preserve drill evidence.

## 6. Rollback procedure

- Current audited release: `4368523`. Previous known-good release: `b8ad726` (pre-Next-15; superseded for the dependency fix, kept in history).
- Rollback = redeploy the previous audited release commit (immutable; never uncommitted code).
- Migrations are forward-compatible by design; after rollback run schema parity before serving traffic; no destructive DB rollbacks.
- After rollback: §4 health + §7 smoke, then re-run `node scripts/phase-w-evidence.mjs`.

## 7. Smoke list (after every deployment)

1. Public health 2. login/logout 3. tenant creation/selection 4. dashboard 5. employee/HR core flow 6. representative APIs per route class (ENCAP/PUBLIC_SELF/SELF_AUTH/RBAC/PROXY — `docs/API_INVENTORY.md`) 7. controlled AI request on primary, then on backup under forced primary failure 8. report + CSV export (formula payloads neutralized, negatives preserved) 9. notification 10. webhook receive + replay (no duplicate side effect) 11. scheduled job 12. oversized-body → 413 on webhook/SCIM/desktop.

## 8. Incident response

1. Is the app up? `/api/health`. 2. DB healthy? `/api/system/ready` + Supabase dashboard. 3. Bridge/AI healthy? `/api/ai/status`; else check bridge process and provider key status (names only). 4. Email/webhooks/jobs? platform dashboards + tenant-scoped `audit_logs` + webhook receipts. 5. Backups? Supabase backup UI + alert receipts. 6. Tenants isolated? re-run RLS via evidence generator; any cross-tenant hit = CRITICAL (stop, page, preserve evidence, fix via Git per §49). 7. What release is deployed? platform deployed-commit must equal `4368523` (or a newer audited SHA). 8. Escalation: operator → repo issue on `batodanial-sketch/AI-HR-Management-system` with phase/gate/evidence paths (never secrets).

## 9. Known limitations (pilot scope)

- Billing `NOT_IMPLEMENTED` (out of scope; do not relabel).
- In-process scheduler until cron host is provisioned; seats soft-enforced; inbound-dispatch webhooks use body-HMAC without timestamp window (documented contract); container hardening items (non-root, pinned digests, resource limits — audit U7) apply at deploy time.
- AI minimization: prompts carry feature payloads only — never passwords/keys/raw HR dumps to providers.
- Non-Supabase memory adapters single-tenant by documented assumption.

## 10. Evidence regeneration (after every milestone)

```bash
PATH="$PWD/.venv/bin:$PATH" CI=1 \
DATABASE_URL=<restore-safe-db-url> \
PG_TOOLS_BIN=<pg-native-bin-dir> \
node scripts/phase-w-evidence.mjs          # regenerates evidence + checklist
node scripts/phase-{s,t,u,v,w}-evidence.mjs --verify   # all must exit 0
```

Gate statuses derive from execution only — never edit generated evidence manually.
