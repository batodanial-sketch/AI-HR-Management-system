# Fluxentiq — AI HR Management & Lead Intelligence Platform

Enterprise HR management and lead-intelligence suite with universal
bring-your-own-key (BYOK) AI. Self-hosted, white-label ready, offline-licensed.

> **Deep buyer/architecture guide:** [`README_ENTERPRISE.md`](README_ENTERPRISE.md)

---

## Table of contents

1. [One-command deployment](#one-command-deployment)
2. [Environment configuration](#environment-configuration)
3. [Offline license keys](#offline-license-keys)
4. [Architecture](#architecture)
5. [CI/CD (GitHub Actions)](#cicd-github-actions)
6. [Local development](#local-development)
7. [Security model](#security-model)

---

## One-command deployment

Prerequisites: **Docker Engine 24+** and **Docker Compose v2** (bundled with
Docker Desktop / `docker compose` plugin). No Node or Python required on the
host — everything runs in containers.

```bash
# 1. Create your environment file from the template
cp .env.example .env

# 2. Edit .env — fill in your Supabase URL/keys, BRIDGE_SECRET_KEY, AI provider
#    (see "Environment configuration" below). Never commit .env.

# 3. Build and start the full stack (app + AI bridge + PostgreSQL)
docker compose up -d --build

# 4. Verify both containers are healthy
docker compose ps
```

The stack comes up as three services:

| Service | Image | Port (host) | Role |
|---------|-------|-------------|------|
| `app`    | Next.js standalone | `3000` | UI + API + `/api/ai/*` proxy |
| `bridge` | Python FastAPI | *(internal)* `8000` | LLM orchestration, scraping, ML engine |
| `db`     | PostgreSQL 16 | *(internal)* `5432` | self-hosted "memory" backend |

Open **http://localhost:3000** and follow the activation screen (start a free
trial or paste a license key).

> Only `app` is published to the host. `bridge` and `db` are reachable solely
> from `app` over the internal network; the bridge additionally requires a
> `BRIDGE_SECRET_KEY` on every `/api/*` request.

### Health checks

Both containers define `HEALTHCHECK` probes with startup grace periods:

- `app`    → `curl -f http://localhost:3000/api/health`
- `bridge` → `curl -f http://localhost:8000/health`

`app` waits on `bridge` becoming healthy before serving traffic
(`depends_on: service_healthy`).

### Updating

```bash
git pull
docker compose up -d --build   # rebuilds images and restarts changed services
```

---

## Environment configuration

All configuration flows through `.env` (a copy of [`.env.example`](.env.example)).

### Supabase (canonical source of truth)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | new **Publishable** key (browser-safe) |
| `SUPABASE_SECRET_KEY` | ✅ | new **Secret** key (server-only, bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | legacy fallback alias (deprecated) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | legacy fallback alias (deprecated) |

### AI provider (bring any key)

| Variable | Notes |
|----------|-------|
| `LLM_PROVIDER` | `openai` \| `groq` \| `gemini` \| `anthropic` \| `custom` |
| `LLM_API_KEY` | vendor API key |
| `LLM_MODEL` / `LLM_BASE_URL` | optional overrides (required for `custom`) |
| `GROQ_API_KEY` / `GROQ_MODEL` | backward-compatible Groq aliases |

The provider can also be configured at runtime from **Settings → AI Provider**
(no env edits required).

### Bridge + internal service auth

| Variable | Required | Notes |
|----------|----------|-------|
| `BRIDGE_SECRET_KEY` | ✅ | shared secret; the bridge **fails closed (401)** when unset. Generate with `openssl rand -hex 32`. |
| `PYTHON_BRIDGE_ALLOWED_SCRAPE_HOSTS` | — | comma-separated host allow-list for the scraper (SSRF guard). Empty = scraping disabled. |

### Webhook / cron secrets (fail-closed)

`CRON_SECRET`, `N8N_WEBHOOK_SECRET`, `PYTHON_BRIDGE_WEBHOOK_SECRET` — each guards
a privileged inbound endpoint. Unset = that endpoint is disabled.

### Self-hosted PostgreSQL (optional)

`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` configure the bundled `db`
service (safe defaults applied when unset).

---

## Offline license keys

Fluxentiq licenses are **Ed25519-signed keys** verified entirely offline — no
license server, no phone-home. A buyer owns the software; a seller issues keys.

### Seller: generate a keypair (once)

```bash
node scripts/license-tool.mjs keypair
# writes the PRIVATE key to data/license-private.pem (KEEP SECRET)
# prints the PUBLIC key → embed in lib/license.ts (or LICENSE_PUBLIC_KEY env)
```

### Seller: issue a signed key

```bash
node scripts/license-tool.mjs issue \
  --tier pro|enterprise \
  --email owner@acme.com \
  --org "Acme Corp" \
  --users 500 \
  [--expires 2027-01-01]          # omit for perpetual
# → prints `FLUX-PRO-…` or `FLUX-ENT-…`
```

### Buyer: activate

Paste the key at `/auth/license` (or **Settings → License**). The product
verifies the signature against the embedded public key and records the tier,
licensed org, seat cap and expiry.

### Tiers

| | Free Trial | Pro | Enterprise |
|---|---|---|---|
| Duration | 15 days | subscription | perpetual |
| Headcount | 10 | configured | unlimited |
| BYOK AI | — | ✅ | ✅ |
| White-label branding | — | ✅ | ✅ |
| Source code | — | — | ✅ |

**Rotate the private key** if it is ever exposed — issue new keys with the new
keypair and embed the new public key.

---

## Architecture

```
Browser ──▶ Next.js (App Router) ──▶ Python FastAPI bridge (:8000)
              │      │                    ├─ LLM providers (Groq/OpenAI/…)
              │      └─ Supabase Postgres  ├─ ML engine (python_engine/*)
              │      └─ Pluggable memory   └─ Scraping (allow-listed)
              └─ Server Actions / REST / GraphQL
```

- **Frontend/API:** Next.js 14 App Router (RSC, Server Actions, Tailwind),
  dual Light/Dark Metropolis theme, R3F 3D hero + dashboard accents.
- **AI bridge:** Python FastAPI — streaming LLM handlers, async job queue,
  scraping with retry/UA rotation, JSON logging, bearer-secret auth.
- **Data:** Supabase Postgres (canonical) with tenant-scoped RLS, plus pluggable
  memory backends (PostgreSQL, SQLite, custom endpoint).
- **Desktop:** Electron shell (`electron-app/`, TypeScript, contextIsolation,
  sandboxed, typed `contextBridge`).

---

## CI/CD (GitHub Actions)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on `push` to `main`
and every PR:

1. **`typecheck-and-build`** — `npm ci` → `tsc --noEmit` → `next lint` →
   `next build` (standalone) → Python `py_compile`.
2. **`e2e-tests`** — Playwright Chromium against the live Supabase project.

### Required GitHub Secrets

Add these in **Settings → Secrets → Actions**:

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | app runtime |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app runtime |
| `SUPABASE_SECRET_KEY` | server-side data + E2E |
| `BRIDGE_SECRET_KEY` | Next → bridge auth |
| `SUPABASE_PROJECT_REF` | E2E session encoding |
| `E2E_TEST_USER_EMAIL` | E2E test identity |
| `E2E_TEST_USER_PASSWORD` | E2E test identity |

> The E2E suite also requires the tenant-provisioning trigger from
> `supabase/AUTH_TENANT_HARDENING.sql` to be applied once to the target project.

---

## Local development

```bash
# Terminal 1 — web app
npm install
npm run dev                      # http://localhost:3000

# Terminal 2 — AI bridge
pip install -r requirements.txt
python3 -m uvicorn server:app --host 0.0.0.0 --port 8000

# Environment
cp .env.example .env.local        # local dev uses .env.local
```

Useful scripts:

```bash
npm run typecheck      # tsc --noEmit (zero-tolerance)
npm run lint           # eslint
npm run build          # next build (standalone)
npm run test:e2e       # playwright test
node scripts/license-tool.mjs keypair   # generate license keypair
```

---

## Security model

- **Tenant isolation** — RLS via `is_organization_member(organization_id)`
  (query-matched on `memberships`), per-user org provisioning at signup.
- **Auth** — Supabase JWT sessions; the trial/license cookie is a *gate flag*
  only — data access always requires a valid JWT + RLS.
- **Bridge auth** — `BRIDGE_SECRET_KEY` bearer/header, constant-time compare,
  fail-closed.
- **Scraping** — host allow-list (SSRF guard), byte caps, retry + UA rotation.
- **Secrets** — `.env*` and `data/` are gitignored; all CI secrets via GitHub
  Secrets placeholders.
- **No third-party tracking SDKs** — the product ships no analytics/error SDK.

See [`docs/DATA_FLOW_AUDIT.md`](docs/DATA_FLOW_AUDIT.md) for the full personal-data
flow map and [`docs/BUG_AUDIT.md`](docs/BUG_AUDIT.md) for the security audit log.
