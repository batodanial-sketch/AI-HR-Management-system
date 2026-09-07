# Fluxentiq — Controlled Pilot Runbook (Phase R)

This runbook is the operational contract for the single controlled pilot
organisation. Every procedure is reversible. Nothing here requires a code
change; all switches are environment variables read at request time.

## Environment contract (never committed)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Production Supabase project |
| `AI_BRIDGE_URL`, `BRIDGE_SECRET_KEY` | Python bridge + shared secret (bridge fails closed without it) |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` (bridge) | Real AI provider |
| `STORAGE_PROVIDER=supabase`, `STORAGE_BUCKET=documents` | Private bucket (must be `public=false`) |
| `MALWARE_SCANNER=clamav-rest|webhook`, `MALWARE_SCANNER_URL`, `MALWARE_SCANNER_TOKEN` | Scanner; uploads are refused when unset |
| `METRICS_BACKEND=prometheus|otlp`, `METRICS_TOKEN` / `OTEL_EXPORTER_OTLP_ENDPOINT` | Metrics |
| `ERROR_TRACKING_DSN` (Sentry-compatible) or `ERROR_TRACKING_WEBHOOK` | Error tracking |
| `PILOT_ORG_ALLOWLIST=<org uuid>` | Exactly one pilot tenant |
| `AI_KILL_SWITCH=1` | Disable all AI/agent traffic immediately |
| `PILOT_MAX_REQUEST_TOKENS`, `PILOT_MAX_TOOL_ROUNDS` | Per-request bounds (defaults 12 000 / 3) |
| `APP_ENV=production`, `APP_BUILD_ID=<git sha>` | Identity in health/readiness/telemetry |

`GET /api/system/ready` returns 503 with the missing control named until all of
the above are satisfied in production.

## Pilot organisation

1. Create the organisation through the normal signup (owner user).
2. Put its UUID in `PILOT_ORG_ALLOWLIST`. Any other tenant receives
   `403 ORG_NOT_ALLOWLISTED` on AI/agent endpoints.
3. Set the monthly AI budget in Settings → AI budget (`ai_budgets`), and keep
   the tier rate limits (`lib/rate-limit.ts`).
4. Invite at most the agreed user count via Settings → Members (canonical
   `memberships` rows). Never assign `owner` to more than two people.

## Kill switches and reversibility

| Action | Procedure | Effect |
|---|---|---|
| **Disable AI** | set `AI_KILL_SWITCH=1` (platform env → redeploy if the platform does not hot-reload) | `/api/ai/*` returns `503 AI_DISABLED` before any provider call; `/api/ai/status` reports `killSwitch: true` |
| **Disable provider** | remove `LLM_API_KEY` from the bridge env; restart bridge | bridge `/health` → `ai.configured=false`; app returns 503 from the bridge |
| **Revoke organisation access** | remove UUID from `PILOT_ORG_ALLOWLIST` (AI) and delete its `memberships` rows (all access) | immediate — RLS and the canonical resolver deny on the next request |
| **Revoke a user** | delete the `memberships` row (Settings → Members → Remove) | immediate; proposals they created can no longer be approved by them |
| **Disable storage** | set `MALWARE_SCANNER=disabled` (uploads refused) or unset `STORAGE_PROVIDER` | uploads return `503 SCANNER_UNAVAILABLE`; existing signed URLs expire within 120 s |
| **Rollback deployment** | redeploy previous `APP_BUILD_ID` (platform "promote previous deployment"); migrations in Phase R are additive, no down-migration needed | verify `/api/system/ready` and `/api/health` |

## Incident procedure

1. Page acknowledges within 15 min. Identify the alert (see `alerts.prometheus.yml`).
2. If customer-impacting AI misbehaviour: `AI_KILL_SWITCH=1` first, investigate second.
3. Capture `x-request-id` values from the error-tracking event; correlate in `audit_logs.metadata.requestId`.
4. If tenant data exposure is suspected: revoke the organisation, snapshot the database (provider backup), preserve logs, notify the customer contact.
5. Post-incident: append to `docs/ops/incidents/` with timeline, blast radius, fix, and the evidence run that re-validated.

## Alert runbook sections

### sustained-5xx
Check `/api/system/ready`. Common causes: Supabase outage (readiness `database` false), bridge down (`aiBridge` false). Mitigate: kill switch for AI-only failures; rollback if a deploy preceded the spike.

### ai-provider-failure
`ai_failures_total{reason="unauthorized"}` → rotated/expired `LLM_API_KEY`. `server_error|unavailable` → provider incident; set kill switch if sustained > 15 min.

### ai-latency
Check provider status page; consider the fallback model configured in AI budget settings.

### database-failure
Supabase dashboard → project health. App fails closed (401/403/503) — no fallback to demo data in production.

### storage-failure
Check bucket exists, is **private**, and the secret key is valid. Uploads fail safely (registry row `rejected`).

### malware-scanner-unavailable
Uploads are refused (fail closed) — this is expected behaviour. Restore the scanner; no backlog exists because nothing was accepted.

### rate-limit-spike
Distinguish a single tenant (`scope=org`) from IP floods (`scope=ip|edge`). Tighten the edge limits or revoke.

### proposal-failures
`stage=integrity` means a proposal row was altered — treat as a security event. `stage=claim` spikes usually mean users re-clicking (already-decided).

### authz-denials
Correlate with `audit_logs`. A spike after a membership change is expected; otherwise probing.

## Backup / restore

Supabase-hosted PostgreSQL: daily backups (Pro plan) with PITR where enabled.
Restore is executed from the Supabase dashboard (provider-operated). After a
restore run, in order:

1. `node scripts/db/local-pg.mjs migrate` is **not** used against production;
   instead verify `select count(*) from supabase_migrations.schema_migrations`.
2. `DATABASE_URL=<read replica or staging copy> node scripts/db/authz-rls-suite.mjs`
   → proves RLS still enabled and the canonical helpers behave.
3. `GET /api/system/ready` → 200.
4. Spot-check `memberships`, `employees`, `audit_logs` row counts against the
   pre-incident numbers recorded in the evidence file.

Because the backup infrastructure is provider-controlled, the evidence
generator marks the backup gate `BLOCKED_EXTERNAL` unless a restore drill was
actually executed and its output attached.

## Billing

Automated billing is **NOT_IMPLEMENTED**. Licensing (`lib/license.ts`) is a
signed offline key + trial cookie. The pilot must be contractually invoiced;
the platform is not commercially self-service.
