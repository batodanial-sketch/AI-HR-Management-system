# Fluxentiq — Enterprise Self-Hosting Guide

Fluxentiq is a turn-key, self-hosted HR + lead-intelligence platform. This
document covers deployment, the Bring-Your-Own-Key (BYOK) AI layer, the
offline license system, and white-label branding — everything a buyer needs to
run and own the software.

---

## 1. Quickstart (Docker)

```bash
# 1. Copy the environment template and fill it in (or run install.sh).
cp .env.example .env

# 2. (Recommended) guided setup — prompts for license key, AI key, Supabase.
bash install.sh

# 3. Or start directly.
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Web app | http://localhost:3000 |
| AI bridge | http://localhost:8000/health |
| PostgreSQL | localhost:5432 (`fluxentiq` / `fluxentiq`) |

The `data/` volume persists runtime settings (`data/settings.json`), the active
license, and local SQLite memory. Back up this volume alongside PostgreSQL.

---

## 2. BYOK — Bring Your Own Key (AI)

Fluxentiq is **vendor-agnostic**. Configure the AI provider from the **Settings
→ AI Provider** screen (or `LLM_PROVIDER` / `LLM_API_KEY` in `.env`):

| Provider | `LLM_PROVIDER` | Default model(s) |
|----------|----------------|------------------|
| Groq | `groq` | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` |
| OpenAI | `openai` | `gpt-4o`, `gpt-4o-mini`, `o3-mini` |
| Anthropic | `anthropic` | `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307` |
| Google Gemini | `gemini` | `gemini-1.5-pro`, `gemini-1.5-flash` |
| Custom / Local | `custom` | any OpenAI-compatible model |

### Custom / local endpoints

Point Fluxentiq at any OpenAI-compatible endpoint via `LLM_BASE_URL`:

```bash
# Ollama
LLM_PROVIDER=custom
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3

# vLLM / LM Studio / Azure OpenAI / internal proxy
LLM_PROVIDER=custom
LLM_BASE_URL=http://host:port/v1
LLM_MODEL=<your-model>
LLM_API_KEY=<optional>
```

The bridge uses the OpenAI chat-completions protocol for `openai`, `groq`,
`gemini` and `custom`; Anthropic uses its native Messages API. All AI features
(screening, PTO decisions, resume parsing, ranking, interview reports,
insights, Copilot) work identically across providers.

---

## 3. License system (offline validation)

Licenses are **Ed25519-signed keys** — no license server, no phone-home:

```
FLUX-<base64url(payload)>.<base64url(signature)>
```

- **Issuer (seller):** `node scripts/license-tool.mjs keypair` generates a
  keypair; `issue` signs a license for a tier/org/email/seats/expiry.
- **Verifier (product):** `lib/license.ts` validates the signature against the
  embedded public key (override via `LICENSE_PUBLIC_KEY`) and enforces expiry.
- **Gate:** the middleware + app shell redirect unlicensed instances to
  `/auth/license`. The license widget in **Settings → License** shows the
  active tier, licensed org, owner, expiry, and seat usage.

### Tiers

| Tier | Meaning |
|------|---------|
| `TRIAL` | 15-day free trial — Groq AI route, 10 employees, feature-gated |
| `PRO` | Commercial license — all features, unlimited records, custom BYOK AI, white-labeling |
| `ENTERPRISE` | Full source-code access — modify and redistribute, perpetual |

Keys are prefixed `FLUX-PRO-` and `FLUX-ENT-`; trials are local (unsigned)
state created via the activation screen's "Continue with 15-Day Free Trial"
button.

### Rotating the signing key

1. `node scripts/license-tool.mjs keypair` — keep `data/license-private.pem`
   secret (gitignored, `0600`).
2. Set the new public key in `.env` as `LICENSE_PUBLIC_KEY` (PEM).
3. Re-issue license keys to existing customers.

---

## 4. Memory (storage backend)

Fluxentiq's data layer is pluggable (**Settings → Memory**):

- **Supabase** (default) — multi-tenant Postgres + auth.
- **PostgreSQL / Xata** — direct Postgres connection.
- **SQLite** — single-file storage.
- **Custom** — any PostgREST-compatible endpoint.
- **Local** — on-device SQLite (`data/local-memory.sqlite`).

Auth/identity (profiles, memberships) stays on Supabase; domain data
(employees, candidates, leave, payroll, leads) routes through the selected
memory backend.

---

## 5. White-label branding

**Settings → Branding** customizes the application name (replaces "Fluxentiq"
in titles/headers), vendor name, primary accent color (drives the CSS
variables), and logo/favicon URLs. Changes persist to `data/settings.json` and
apply globally.

---

## 6. Modifying the source (enterprise licensees)

The stack is standard and vendor-agnostic:

- **Frontend:** `app/` + `components/` (Next.js App Router, Tailwind, Radix,
  Framer Motion). Design tokens live in `styles/design-tokens.css`.
- **AI bridge:** `server.py` + `bridge/` (FastAPI, pluggable providers in
  `bridge/providers/`).
- **Database:** `supabase/migrations/` (or your own Postgres schema — the data
  layer maps rows generically).

`data-testid` attributes are the E2E contract (`e2e/`) — preserve them when
editing UI, and run `npx playwright test` to confirm no regressions.

---

## 7. Platform services

| Service | Where | Notes |
|---------|-------|-------|
| **Audit logging** | `lib/audit.ts` | Every domain mutation writes to `audit_logs` (who/what/when) |
| **Notifications** | `lib/notifications.ts` | In-app feed via the `notifications` table + `/api/notifications` |
| **Email** | `lib/email.ts` | Provider-agnostic: `EMAIL_PROVIDER=console\|smtp\|http` + `EMAIL_HTTP_URL` relay |
| **Webhooks** | `lib/webhooks.ts` | Registry + HMAC-signed dispatch (`X-Fluxentiq-Signature`) + delivery audit |
| **AI usage metering** | `lib/ai-usage.ts` + `bridge/usage.py` | Every AI call recorded to `ai_usage` (feature + model) |
| **Reports/exports** | `lib/reports.ts` + `/api/reports?type=…` | Server-side CSV/JSON exports (employees, candidates, leads, deals, leave) |
| **Rate limiting** | `lib/rate-limit.ts` | Fixed-window limiter on the AI surface (`AI_RATE_LIMIT`) |
| **Scheduler** | `lib/scheduler.ts` + `/api/system/cron` | Cron-driven jobs (trial expiry, payroll reminders); guard with `CRON_SECRET` |

### Configuring the scheduler

Point any cron system at `/api/system/cron` with a shared secret:

```bash
# .env
CRON_SECRET=change-me

# crontab (every 10 minutes)
*/10 * * * * curl -H "x-cron-secret: change-me" http://localhost:3000/api/system/cron
```

### System health

`/api/system/health` aggregates the status of every subsystem (AI bridge,
memory, license) and is surfaced in **Settings → System Health**. Point
monitoring at it, or use the dashboard for a live view.

### Marketing site

The public landing (`/`), pricing (`/pricing`) and docs (`/docs`) pages are
served alongside the app and are never license-gated — they're the
white-label storefront a reseller points prospects at.

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Redirected to `/auth/license` | Activate a license key at `/auth/license` |
| AI features return 502 | Bridge not running, or provider not configured — check `/health` and Settings → AI Provider |
| "Supabase not configured" | Set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or switch Memory to local/Postgres) |
| `better-sqlite3` build failure | Ensure `python3 make g++` are installed (the Docker image already includes them) |
