# Fluxentiq — Production Pilot Runbook (Phase S)

Operational contract for the first **controlled external pilot** of Fluxentiq.
This runbook supersedes `docs/ops/pilot-runbook.md` (Phase R) and adds the
Phase S production procedures. Every procedure below is executable from
environment variables, documented SQL, or deployment-platform actions — no
code change is ever required for an emergency procedure.

> Launch condition: `PRODUCTION PILOT VALIDATED` (see
> `docs/generated/phase-s-evidence.json`). While any
> `BLOCKED_EXTERNAL` gate is open the pilot may not start; this runbook is the
> instrument used to close each gate.

---

## 1. Onboarding (pilot organisation)

1. Create the pilot organisation via normal signup (owner user) — or, for an
   invited pilot, create the organisation server-side and invite the
   customer contact as `owner`.
2. Put the organisation UUID in `PILOT_ORG_ALLOWLIST` (see §4). Any other
   tenant receives `403 ORG_NOT_ALLOWLISTED` on AI/agent endpoints.
3. Set the monthly AI budget in Settings → AI budget (`ai_budgets`); keep the
   tier rate limits (`lib/rate-limit.ts`) as the contractual ceiling.
4. Invite at most the agreed number of users via Settings → Members
   (canonical `memberships` rows). Never grant more than two `owner`
   memberships.
5. Record in the pilot file (private, never committed): org UUID, member
   emails/roles, model & budget, agreed invoice terms.
6. Hand over §2 (environment verification) results + this runbook to the
   on-call engineer.

## 2. Environment verification

Run before every release and before the pilot starts:

1. `GET /api/health` → `200` (liveness — process alive).
2. `GET /api/system/health` → subsystem aggregates.
3. `GET /api/system/ready` → `200` **only** when every production control is
   configured: database (Supabase reachable), aiBridge (provider configured),
   bridgeSecret, storage (provider=supabase), malwareScanner (backend
   enabled), metrics, errorTracking, pilotConfig (`PILOT_ORG_ALLOWLIST` set,
   scanner enabled in production).
4. `GET /api/ai/status` → reports bridge reachability, provider/model and
   kill-switch state (no hosts/keys in the response).
5. Regenerate evidence at the deployed commit:

   ```bash
   PATH=".venv/bin:$PATH" DATABASE_URL="$SUPABASE_POOLER_URL" \
     PILOT_BASE_URL="$PILOT_URL" PG_TOOLS_BIN="$PG_TOOLS_BIN" \
     node scripts/phase-s-evidence.mjs && node scripts/phase-s-evidence.mjs --verify
   ```

   Expected verdict: `PRODUCTION PILOT VALIDATED` (all gates green, zero
   `BLOCKED_EXTERNAL`).

### Environment contract (never committed)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF` | Production Supabase project (ref is identity, keys are secrets) |
| `AI_BRIDGE_URL`, `BRIDGE_SECRET_KEY` | Python bridge + shared secret (bridge fails closed without it) |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` (bridge) | Real AI provider |
| `STORAGE_PROVIDER=supabase`, `STORAGE_BUCKET=documents` | **Private** bucket (`public=false`) |
| `MALWARE_SCANNER=clamav-rest\|webhook`, `MALWARE_SCANNER_URL`, `MALWARE_SCANNER_TOKEN` | Scanner; uploads refused when unset (`disabled` in production ⇒ 503) |
| `METRICS_BACKEND=prometheus\|otlp`, `METRICS_TOKEN` / `OTEL_EXPORTER_OTLP_ENDPOINT` | Metrics backend |
| `ERROR_TRACKING_DSN` (Sentry-compatible) or `ERROR_TRACKING_WEBHOOK` | Error tracking |
| `PILOT_ORG_ALLOWLIST=<org uuid>` | Exactly the pilot tenant(s) |
| `AI_KILL_SWITCH=1` | Disable all AI/agent traffic immediately |
| `PILOT_MAX_REQUEST_TOKENS`, `PILOT_MAX_TOOL_ROUNDS` | Per-request bounds (defaults 12 000 / 3) |
| `APP_ENV=production`, `APP_BUILD_ID=<git sha>`, `PILOT_DEPLOYMENT_ID` | Identity in health/readiness/telemetry |

## 3. User creation (HR_ADMIN / MANAGER / EMPLOYEE)

1. Create users through Supabase Auth (invitation) or admin API
   (`supabase.auth.admin.createUser`) — never create `auth.users` rows
   directly in SQL.
2. Assign roles ONLY through canonical `memberships`
   (`user_id, organization_id, role`): `owner|admin` → HR_ADMIN surface,
   `manager` → MANAGER, `member` → EMPLOYEE. Roles are read from
   `memberships` at request time by the canonical resolver
   (`lib/rbac`, `lib/pilot/controls`); nothing client-supplied overrides them.
3. Verify the S1 auth checklist once per role:
   login → session created → refresh → logout → login again; expired and
   invalid sessions rejected (`401`); authorized request `200/2xx`;
   unauthorized request denied.

## 4. Organisation allowlisting

```bash
# App env (platform secrets): comma-separated org UUIDs
PILOT_ORG_ALLOWLIST=11111111-1111-4111-8111-111111111111
```

* AI endpoints: org not in the list ⇒ `503 ORG_NOT_ALLOWLISTED`-style denial
  (`evaluatePilotAccess`), before any provider call.
* Storage/API access is additionally governed by RLS + canonical membership —
  allowlisting is the AI gate, not the only gate.
* To **revoke an organisation** see §14.

## 5. AI enable / disable

* Enable: set `AI_KILL_SWITCH=0`, add org to `PILOT_ORG_ALLOWLIST`, ensure
  bridge has `LLM_API_KEY`; then `GET /api/ai/status` shows
  `bridge.configured=true`, `pilot.thisOrgAllowed=true`.
* Disable (reversible): set `AI_KILL_SWITCH=1` — every AI/agent endpoint
  returns `503 AI_DISABLED` before any provider call; `/api/ai/status`
  reports `killSwitch: true`.
* Disable provider: remove `LLM_API_KEY` from the bridge env and restart the
  bridge — `/health` then reports `ai.configured=false` and the app returns
  `503` from the bridge.

## 6. Storage procedures

* Bucket `documents` is **private** (`public=false`). No application code may
  call `getPublicUrl` or create a public bucket (enforced by the s2 gates).
* Upload pipeline (all documents incl. resumes):
  authenticated upload → authorization (canonical RBAC) → file validation
  (`lib/storage/validate.ts`: type/MIME/size/name) → quarantine record →
  malware scan → `CLEAN` → private storage under
  `<organization_id>/<document_id>.<ext>` → signed, short-lived retrieval
  URLs (Supabase signed URLs / local HMAC signing).
* Retrieval is authorized per request; URLs expire (~120 s); cross-tenant
  download/delete is denied by key scoping + RLS + RBAC.
* **Retention**: pilot documents retained per the pilot agreement; deletion
  is a soft delete (`deleted` status row + object removal) with the audit
  record preserved.

## 7. Malware incident procedure

| Verdict | Behaviour | Action |
|---|---|---|
| `CLEAN` | accepted to private storage | none |
| `INFECTED` | rejected, quarantined, **no access**, audit event | notify security + customer contact; preserve sample (never open); snapshot audit metadata |
| `UNAVAILABLE` / `TIMEOUT` / `ERROR` | **never accepted** — upload refused (fail closed) | restore scanner; no backlog exists because nothing was accepted |

1. Scanner down ⇒ uploads 503 — that is correct, do not "temporarily allow".
2. Investigate the alert (`MalwareScannerUnavailable`), restore
   `MALWARE_SCANNER_URL` service.
3. EICAR regression: upload an EICAR test file — must be rejected and
   audited. Real malware is never uploaded for tests.
4. Post-incident: append timeline/blast radius to `docs/ops/incidents/`.

## 8. Rollback

1. Redeploy the previous build (`APP_BUILD_ID` — platform "promote previous
   deployment").
2. Phase R/S migrations are additive; **no down-migration is needed**.
3. Verify: `GET /api/system/ready` → `200`; `GET /api/health` → `200`;
   spot-check audit log timestamps vs deployment window.

## 9. Provider outage procedure

* **AI provider outage**: set `AI_KILL_SWITCH=1` if degraded > 15 min
  (or immediately for misbehaviour); check provider status page; fall back to
  the configured fallback model (AI budget settings) only if the pilot agreed.
* **Bridge outage**: `/api/system/ready` reports `aiBridge: unreachable`.
  Restart bridge; verify `/health`; kill switch remains off only if
  acceptable to serve without AI (readiness will stay 503 for AI checks).
* **Scanner outage**: see §7 — uploads fail closed.
* **Metrics/error-tracking outage**: application continues; alerts for their
  availability fire (`ApplicationAvailability`); restore endpoint config
  without restart if the platform hot-reloads env, else redeploy.

## 10. Database outage procedure

1. Detect: `DatabaseFailure` alert, `/api/system/ready` → database check
   false. The app fails closed — no demo-data fallback in production.
2. Confirm on the Supabase dashboard (project health / status page).
3. If AI-only symptom of DB outage: `AI_KILL_SWITCH=1`.
4. During provider outage: do not restart app servers (they will reconnect);
   keep logs with `x-request-id`.
5. After recovery: verify `ready` → `200` and audit-log continuity.

## 11. Emergency kill switch

```bash
# Platform env → redeploy only if the platform does not hot-reload env
AI_KILL_SWITCH=1
```

* Effect within one request cycle: every AI/agent endpoint `503 AI_DISABLED`
  before any provider call; `/api/ai/status` → `killSwitch: true`.
* Completed actions remain auditable (audit_logs untouched).
* This is the FIRST action for any AI safety event; investigate second.

## 12. Revoke a user

1. Delete the user's `memberships` row (Settings → Members → Remove, or
   `DELETE FROM public.memberships WHERE user_id=... AND organization_id=...`
   under a service context with the documented change-control).
2. Effect: immediate — canonical resolver denies on the next request; RLS
   denies table access; proposals they created can no longer be approved by
   them; edge buckets re-key to their remaining membership (none).
3. If the user should not sign in at all: also revoke the Supabase Auth
   session (admin API `signOut`/disable user).
4. Record an audit note with request IDs.

## 13. Revoke an organisation

1. Remove the org UUID from `PILOT_ORG_ALLOWLIST` — AI denied immediately.
2. Delete or disable the org's `memberships` rows — all access denied.
3. Suspend `ai_budgets` row and any webhook targets for the org.
4. Keep data for the contractual retention period; snapshot the database
   first if legal holds require it (§16).
5. Verify with a member session: all endpoints `403`/`401`.

## 14. Backup / restore procedure

* Provider-operated backups: Supabase-hosted PostgreSQL daily backups (Pro)
   with PITR where enabled. Backups are managed from the Supabase dashboard.
* **Pre-restore**: snapshot current row counts of critical tables
   (`organizations`, `memberships`, `employees`, `audit_logs`,
   `copilot_proposals`, `documents`) into the incident file.
* **Restore** (provider console → restore to point-in-time / latest):
  1. Restore into a scratch project first whenever possible.
  2. Verify `supabase_migrations.schema_migrations` matches the intended
     migration set (never replay migrations over a restored DB blindly).
  3. `DATABASE_URL=<restored pooler url> node scripts/db/authz-rls-suite.mjs`
     → 76/76 (RLS survives).
  4. `GET /api/system/ready` → 200 after repointing the app.
  5. Spot-check critical row counts against the pre-restore snapshot.
  6. Local supporting drill (not a substitute): see
     `s11-local-restore-drill` in the Phase S evidence for the pg_dump →
     pg_restore → RLS re-run procedure.
* **If the provider does not permit an actual restore test**, the gate stays
  `BACKUP RESTORE — BLOCKED_EXTERNAL`; do not claim PASS from migration
  replay.

## 15. Incident escalation

| Severity | Definition | Response |
|---|---|---|
| SEV-1 | tenant data exposure, active malware acceptance, auth bypass | kill switch + revoke org + snapshot DB + preserve logs + notify customer contact & security within 1 h |
| SEV-2 | AI misbehaviour, scanner outage > 15 min, sustained 5xx | kill switch if AI; page on-call; restore service |
| SEV-3 | alert noise, degraded telemetry | next business day |

Every incident: capture `x-request-id` values from error-tracking events;
correlate in `audit_logs.metadata.requestId`; append post-incident review to
`docs/ops/incidents/` with timeline, blast radius, fix, and the evidence run
that re-validated.

## 16. Post-pilot review

1. Collect: evidence run at pilot end, audit-log export, alert history,
   error-tracking stats, metrics (AI failure rate, latency, tool calls,
   proposal outcomes), support tickets.
2. Verify: zero security events; all kill-switch/revocation drills executed
   cleanly; invoices match usage (non-billing pilot is contractually invoiced
   — see §17).
3. Decide: extend pilot, graduate to GA, or wind down (revoke org §13,
   retention per agreement, final backup §16).
4. File the review in `docs/ops/incidents/` and refresh this runbook with
   lessons learned.

## 17. Billing

Automated billing is **NOT_IMPLEMENTED** (licensing is an offline signed key,
`lib/license.ts`). This pilot is explicitly **PILOT IS NON-BILLING /
MANUALLY CONTROLLED**: invoiced contractually, usage tracked via metrics and
`ai_budgets`. Automated billing, if a later pilot requires it, must be
implemented and validated before that launch — never silently assumed.

## 18. S-gate execution pointers

* S1 auth & RLS matrix, S2 20-case storage matrix, S3 scanner cases,
  S4 alert firing, S5 synthetic exception, S6 provider matrix, S7 cognitive
  run, S8 agent-action matrix, S9 kill-switch drill, S10 deployment smoke
  (20 steps), S11 provider restore, S12 performance, S13 failure injection,
  S14 security close-out: all are driven by
  `node scripts/phase-s-evidence.mjs` (with
  `DATABASE_URL`, `PG_TOOLS_BIN`, `PILOT_BASE_URL`, bridge env set) and the
  checklists embedded in its gate details. Attach provider screenshots /
  alert ids / restore outputs to `docs/ops/incidents/` and re-run the
  generator to record them.
