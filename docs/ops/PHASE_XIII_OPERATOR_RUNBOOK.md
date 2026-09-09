# FLUXENTIQ AI — PHASE XIII OPERATOR RUNBOOK

**Date:** 2026-09-09 · **Applies to release:** `4368523261e0472cbbc059bafd54926b0fa1dcfb` (canonical branch `arena/01a07c94-ai-hr-management-system`)
**Status:** NO PRODUCTION ENVIRONMENT PROVISIONED YET — this runbook is the definitive procedure for the operator who provisions it. It contains **no credentials** — only variable **names**, commands, and steps. When each provisioning step completes, re-run the official evidence generator to move gates deterministically.

---

## 1. Production identity (fill on provisioning)

| Field | Value |
|---|---|
| Production URL | `https://<pilot-host>/` (assigned by hosting platform) |
| Deployed release SHA | `4368523261e0472cbbc059bafd54926b0fa1dcfb` (verify after deploy: platform "deployed commit" == this SHA) |
| Supabase project ref | `<ref>.supabase.co` |
| Evidence anchor | see `docs/PHASE_XIII_REPORT.md` §Evidence |

## 2. Prerequisite: secret inventory (names only)

All values live in the platform secret store / `.env.local` (never in git, evidence, or chat). Full list with fail-closed semantics: `.env.example`. Groups:

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF`, `DATABASE_URL`
- **AI + bridge:** `LLM_API_KEY` (primary provider) + provider URL/model vars, backup provider key vars, `AI_BRIDGE_URL`, `BRIDGE_SECRET_KEY`
- **Observability:** error-tracking DSN var, metrics endpoint + headers/token (OTLP), alert webhook/channel token
- **Email:** relay API key / SMTP creds, verified sender(s)
- **Integrations:** `N8N_WEBHOOK_SECRET`, `PYTHON_BRIDGE_WEBHOOK_SECRET`, `WORKFLOW_WEBHOOK_SECRET`, `SLACK_SIGNING_SECRET`, SCIM tokens (per-tenant preferred), `CRON_SECRET`, `METRICS_TOKEN`
- **Platform:** `PILOT_BASE_URL`, `PILOT_DEPLOYMENT_ID`

## 3. Provisioning order and verification (each step → verify → re-run evidence)

1. **Supabase project:** create org + project at supabase.com/dashboard; record URL/keys into the secret store. Apply repository migrations through the project's migration mechanism only (never hand-edit schema). Migrations live in `supabase/migrations/`; the migration ledger + schema hash are maintained by the evidence generator (Phase S).
   - Verify: `curl -sI https://<ref>.supabase.co/auth/v1/health` → 200.
2. **Hosting deployment:** deploy **commit `4368523`** of repo `batodanial-sketch/AI-HR-Management-system` on Vercel/Render/Railway/Fly.io (Next.js 15.5.25 (audited release), standalone output — see `scripts/preflight.sh` Gate 3/4). Set all secrets in the platform store. HTTPS terminates at the platform.
   - Verify: `curl -sI https://<app>/api/health` → 200; `curl -sI https://<app>/api/system/health` → 401 without session (distinct semantics); confirm platform reports deployed commit `4368523`.
3. **Python bridge:** deploy `bridge/` + `python_engine/` (Python 3.11+, deps from `python_engine/requirements.txt`) as a private service; set `BRIDGE_SECRET_KEY` identically on app + bridge; `AI_BRIDGE_URL` on the app points at it.
   - Verify: app `/api/ai/status` reflects bridge reachability; keep the SSRF allow-list intact.
4. **AI primary + backup:** store provider keys; app defaults to primary; fallback ladder (timeout/429/5xx/invalid) is code-tested — verify live with one controlled request each.
5. **Storage + ClamAV:** private buckets created by migrations; object keys tenant-scoped. Provision ClamAV (managed or self-hosted container) and set its URL env var. Verify EICAR artifact → reject; clean file → accept (CLEAN-only policy).
6. **Email:** configure relay creds + verified sender; keep `EMAIL_PROVIDER` off `console`. Send only to controlled test recipients. Verify SPF/DKIM/DMARC records with the provider.
7. **n8n / webhooks:** create the inbound workflows; set shared signing secrets. Signature verification + 5 MB body cap are enforced by the app (`middleware.ts`, `lib/http-limit.ts`).
8. **Cron:** point the platform scheduler at the cron endpoints with `CRON_SECRET`/`METRICS_TOKEN` headers (endpoints per route inventory); scheduler claims are atomic in the DB.
9. **Metrics/alerting/error tracking:** set OTLP endpoint/token, alert channel(s), error-tracking DSN + release `4368523`. Create the minimum alert set (§33 of the phase brief): 5xx spike, DB failure, AI failure, bridge failure, webhook failure, job failure, backup failure, malware-scanner failure, auth abuse. Trigger one controlled alert and verify delivery.
10. **Backups:** enable Supabase backups (schedule/retention); document RPO/RTO from the actual schedule. Restore drill: follow §5 below against a **restore environment**, never production data.

## 4. Health checks (all live once deployed)

| Check | Endpoint | Expect |
|---|---|---|
| Public liveness | `/api/health` | 200 (no details, no secrets) |
| Session-gated detail | `/api/system/health`, `/api/system/ready` | 401 unauthenticated; 200 with session |
| AI status | `/api/ai/status` | distinct from liveness |
| Deployment SHA | hosting platform UI/API | `4368523` |

The four endpoints must keep **distinct semantics** (never all-200); health endpoints must never leak env vars, credentials, or topology.

## 5. Restore procedure (controlled drill)

1. Take/select the newest completed backup (record backup ID + timestamp).
2. Restore into a fresh **restore environment** (new Supabase project or ephemeral Postgres) — never over production.
3. Re-run schema parity + RLS: the evidence generator executes the 76/76 RLS restoration checks; expect 76/76.
4. Verify application connectivity: point a temporary app env at the restore environment; run the smoke list (§7).
5. Record: backup identifier, restore timestamp, restore environment, release SHA, result. Do not delete the drill evidence.

## 6. Rollback procedure

- Current audited release: `4368523`. Previous known-good release: `b8ad726` (pre-Next-15; superseded for the dependency fix). Any later release only follows an audited fix (new audited SHA).
- Rollback = redeploy the previous release commit in the hosting platform (immutable, no uncommitted code).
- DB migrations are forward-compatible by design; on rollback, run the evidence schema-parity check before serving traffic. Do not perform destructive DB rollbacks.
- After rollback: run §4 health checks + smoke §7, then re-run `node scripts/phase-w-evidence.mjs`.

## 7. Smoke list (post-deployment)

1. Public health 2. login/logout 3. tenant creation/selection 4. dashboard 5. employee/HR core flow 6. representative APIs per route class (ENCAP/PUBLIC_SELF/SELF_AUTH/RBAC/PROXY — see `docs/API_INVENTORY.md`) 7. one controlled AI request (primary, then backup under forced primary failure) 8. report + CSV export (formula payloads neutralized) 9. notification 10. webhook receive + replay (no duplicate side effect) 11. scheduled job run 12. oversized-body → 413 on webhook/desktop/SCIM.

## 8. Incident escalation (operator answers §82 of the brief)

1. Is the application up? → `/api/health`.
2. DB healthy? → session-gated `/api/system/ready` + Supabase dashboard.
3. Bridge healthy? AI healthy? → `/api/ai/status`; else check bridge process + provider keys (names only) + allow-list.
4. Email/webhooks/jobs healthy? → platform dashboards + app audit records (`audit_logs`, tenant-scoped) + webhook receipts.
5. Backups healthy? → Supabase backup UI + alert receipt.
6. Tenants isolated? → run RLS suite via evidence generator; any cross-tenant hit = CRITICAL (stop, page, evidence, fix per change discipline).
7. What release is deployed? → platform deployed-commit field must equal `4368523` (or a newer audited SHA).
8. Escalation path: operator → repo issue on `batodanial-sketch/AI-HR-Management-system` with phase + gate + evidence artifact paths (never paste secrets).

## 9. Known limitations (pilot scope)

- Billing: `NOT_IMPLEMENTED` (out of product scope; do not relabel).
- In-process scheduler (no external cron until provisioned); seats are soft-enforced; inbound-dispatch webhooks use body-HMAC without timestamp window (documented contract); container hardening items from the audit (non-root, pinned digests, resource limits) apply at deploy time — see `docs/BACKEND_ULTIMATE_AUDIT.md` U7.
- AI/data minimization: prompts carry feature payloads only; never send passwords/keys/raw HR dumps to providers.
- Non-Supabase memory adapters are single-tenant by documented assumption.

## 10. Evidence regeneration (after any provisioning step)

```bash
PATH="$PWD/.venv/bin:$PATH" CI=1 \
DATABASE_URL=<restore-safe-db-url> \
PG_TOOLS_BIN=<pg-native-bin-dir> \
node scripts/phase-w-evidence.mjs        # regenerates evidence + checklist
node scripts/phase-{s,t,u,v,w}-evidence.mjs --verify   # all must exit 0
```

Gate statuses are derived from execution only — never edit generated evidence manually.
