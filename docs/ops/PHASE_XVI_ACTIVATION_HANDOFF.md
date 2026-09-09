# FLUXENTIQ AI — PHASE XVI ACTIVATION HANDOFF

**Purpose:** exact operator provisioning checklist for taking FLUXENTIQ AI from "ready" to "deployed and proven."
**Date:** 2026-09-09 · **Release to deploy:** `4368523261e0472cbbc059bafd54926b0fa1dcfb` (`4368523`) · **Branch:** `arena/01a07c94-ai-hr-management-system` (Next.js 15.5.25 standalone, React 18)
**Secret rule:** secrets enter ONLY the provider/deployment secret store named in "Where secret must be stored" — never git, docs, reports, evidence, chat, or client bundles. After each step: secret scan must stay 0 hits; then re-run `node scripts/phase-w-evidence.mjs` so gate statuses derive from real execution (evidence location column).

---

## TOP 3 RESOURCES FIRST (blocking everything else)

1. **Secret delivery mechanism** — nothing can be configured until a secure store exists.
2. **Supabase production project** — the real database/auth/storage/backup foundation.
3. **HTTPS hosting deployment of release `4368523`** — the real application endpoint.

---

## Activation checklist

| SERVICE | ACCOUNT REQUIRED | RESOURCE TO CREATE | SECRET REQUIRED | WHERE SECRET MUST BE STORED | EXPECTED OUTPUT | VERIFICATION COMMAND |
|---|---|---|---|---|---|---|
| 1. Secret delivery | Deployment platform account (Vercel/Render/Railway/Fly) or approved secret manager | Platform project + encrypted env-var store | all secrets below, by name | platform secret store / secret manager (never git/chat/docs) | store exists; names match `.env.example` | secret scan = 0 hits (`scripts/preflight.sh` Gate 7) |
| 2. Supabase | supabase.com account | Production project `<ref>.supabase.co`; apply `supabase/migrations/` (36) via project migration mechanism | `SUPABASE_SECRET_KEY`, `DATABASE_URL`, project ref | platform secret store | migrations applied; schema hash matches; RLS active | `curl -sI https://<ref>.supabase.co/auth/v1/health` → 200; evidence Phase S |
| 3. HTTPS hosting | hosting platform account | Deploy **exactly commit `4368523`** of `batodanial-sketch/AI-HR-Management-system` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (+ all §2 secrets) | platform secret store | public HTTPS URL; platform "deployed commit" == `4368523` | `curl -sI https://<app>/api/health` → 200; deployed-SHA check |
| 4. Domain / DNS / TLS | domain registrar + hosting platform | DNS records (A/AAAA/CNAME) → platform; auto/managed TLS cert | none (DNS + platform-managed cert) | platform | valid cert chain, HTTP→HTTPS redirect, HSTS | `curl -svI https://<domain>` cert/hostname/headers |
| 5. Storage | Supabase (from §2) | private buckets via migrations; tenant-scoped keys | none (uses Supabase secrets) | platform secret store | authorized upload/download OK | cross-tenant download → DENIED |
| 6. ClamAV | scanner provider or container host | scanner service/endpoint | scanner URL/credentials | platform secret store | clean→accepted; EICAR→rejected; down→fail-closed | evidence Phase S3 gates |
| 7. AI primary | AI provider account (Groq/OpenAI/Anthropic/Gemini) | API key + model config | provider API key | platform secret store (server-only; never client) | one controlled real generation; usage/cost accounted | `/api/ai/status`; controlled prompt |
| 8. AI backup | second AI provider account | API key + fallback config | backup provider API key | platform secret store | primary 429/5xx/timeout → backup succeeds; both fail → safe error | forced-failure test |
| 9. Bridge | hosting platform | private deployment of `bridge/` + `python_engine/` (Python 3.11+, `python_engine/requirements.txt`) | `BRIDGE_SECRET_KEY` (same value app-side), `AI_BRIDGE_URL` | platform secret store (both services) | authenticated proxying; invalid/missing secret denied; SSRF blocked | valid + invalid-secret requests |
| 10. Email | email relay account (SendGrid/Resend/Postmark/SMTP) | verified sender + API key | relay key/SMTP credentials | platform secret store | controlled-recipient delivery; SPF/DKIM/DMARC records | provider dashboard delivery log |
| 11. Webhooks / n8n | n8n (cloud/self-hosted) account | inbound workflow(s) hitting the app's webhook routes | `N8N_WEBHOOK_SECRET` (+ other signing secrets) | platform secret store + n8n credentials | valid signature → processed once; replay → no duplicate side effect | replay identical payload |
| 12. Scheduler | hosting platform / cron provider | cron jobs → `/api/cron/*` + `/api/system/cron` with secrets | `CRON_SECRET`, `METRICS_TOKEN` | platform secret store | scheduled runs; duplicate prevented; unauthorized trigger denied | run + forced duplicate |
| 13. Metrics | metrics provider (Prometheus/Grafana/OTLP) | endpoint + token | metrics token/OTLP endpoint headers | platform secret store | request/latency/error/AI-usage series visible | evidence Phase S4 gates |
| 14. Alerting | alert channel (email/Slack/PagerDuty) | alert rules (5xx spike, DB, AI, bridge, webhook, job, backup, scanner, auth abuse) | channel webhook/token | platform secret store | controlled alert: TRIGGER→DELIVERY→RECEIPT→RESOLUTION | trigger one controlled alert |
| 15. Error tracking | Sentry (or equivalent) | project + DSN | DSN + `release=4368523` | platform secret store | controlled error captured with release/env/stack, no secrets/PII | generate one test error |
| 16. Backups | Supabase (from §2) | enable backups: schedule + retention + encryption | none (platform-managed) | — | backup completes; ID/timestamp/size recorded | evidence Phase S11 |
| 17. Restore drill | isolated Supabase project or ephemeral Postgres | restore newest backup into ISOLATED environment | none (restore env secrets separate) | isolated env secret store | schema/data/RLS intact | RLS **76/76 after restore** |
| 18. Final W evidence | repository toolchain + restore-safe DB | run official generator | `DATABASE_URL` (restore-safe) via env | environment (never committed) | W rollup re-evaluated; verifiers exit 0 | `node scripts/phase-w-evidence.mjs` + `phase-{s,t,u,v,w}-evidence.mjs --verify` |

## Evidence location per step

`docs/generated/phase-{r,s,t,u,v,w}-evidence.json` + readiness-gaps (regenerated at each milestone) · `docs/ops/operator-provisioning-checklist.json` (statuses flip as steps complete) · `docs/PHASE_XVI_REPORT.md` §3 matrix.

## Failure conditions

- Committed/leaked secret anywhere → STOP, rotate, document incident.
- Cross-tenant access allowed at any layer → CRITICAL FAIL, stop pilot.
- Deployed commit ≠ `4368523` → `PRODUCTION BLOCKED — RELEASE MISMATCH`; redeploy exact SHA.
- Restore drill fails → backup path not PASS until a restore succeeds.
- Scanner/AI/email/webhook partner unavailable → that service stays `BLOCKED_EXTERNAL`; never fake it.
