# Fluxentiq — Launch Readiness Checklist

**Date:** 2026-08-21
**Scope:** Final staging verification across Docker Compose, documentation, and build validation.

---

## Summary

| # | Check | Result |
|---|-------|--------|
| 1 | `docker-compose.yml` YAML validity | ✅ PASS |
| 2 | Compose env-var bindings complete | ✅ PASS |
| 3 | Healthcheck endpoints + grace periods | ✅ PASS |
| 4 | Next.js standalone output | ✅ PASS (29 MB, `server.js` emitted) |
| 5 | Bridge build context (python_engine ships) | ✅ PASS *(fixed critical bug)* |
| 6 | Production README.md | ✅ PASS |
| 7 | Secret hygiene (no live keys in source) | ✅ PASS |
| 8 | `tsc --noEmit` / `next lint` / `next build` | ✅ PASS (0 / 0 / green) |

**Overall: LAUNCH READY** — pending the one external action below.

---

## 1. Docker Compose Staging Verification

### 1a. Environment variable bindings

| Service | Bound variables | Status |
|---------|-----------------|--------|
| `app` | `AI_BRIDGE_URL`, `BRIDGE_SECRET_KEY`, Supabase URL + publishable/secret keys (new + legacy fallbacks) | ✅ complete |
| `bridge` | `BRIDGE_SECRET_KEY`, `PYTHON_BRIDGE_ALLOWED_SCRAPE_HOSTS`, Supabase URL + secret key | ✅ complete |
| `db` | `POSTGRES_USER/PASSWORD/DB` (safe defaults) | ✅ complete |

All secrets interpolate from host `.env` via `${VAR:-}` — **nothing hardcoded**.

### 1b. Healthcheck timing

| Service | Probe | interval / timeout / start-period / retries |
|---------|-------|---------------------------------------------|
| `app` | `curl -f http://localhost:3000/api/health` | 15s / 5s / **30s** / 5 |
| `bridge` | `curl -f http://localhost:8000/health` | 15s / 5s / **15s** / 5 |
| `db` | `pg_isready -U …` | 10s / 5s / 10s / 5 |

`app` uses `depends_on: bridge: service_healthy` so the UI never serves before
the AI bridge is up. *(Note: Compose has no true exponential backoff — generous
`start_period` + `retries` is the closest native equivalent.)*

### 1c. Standalone static assets + native deps

- ✅ `server.js` + traced `node_modules` emitted (`.next/standalone`, 29 MB).
- ✅ `.next/static` + `public/` explicitly copied (Next does NOT include them in standalone).
- ✅ `better-sqlite3` + `bindings` copied (dynamically `require`d — output tracing misses them).
- ✅ `public/brand/*` logos present.

### 1d. Bridge container (`python_engine`)

- ✅ `bridge/Dockerfile` now `COPY python_engine ./python_engine` (engine routes lazy-import it).
- ✅ curl installed for the healthcheck.
- ✅ **CRITICAL FIX applied this pass:** compose `build: ./bridge` → `build: { context: ., dockerfile: bridge/Dockerfile }`. The Dockerfile COPYs `requirements.txt`, `server.py` and `python_engine/` from the **repo root** — the old context would have failed with `requirements.txt not found in build context`.
- ✅ `BRIDGE_SECRET_KEY` enforced (fail-closed 401 when unset).

---

## 2. Production Documentation

- ✅ **`README.md`** created — enterprise/self-hoster focused: one-command
  `docker compose up -d --build`, full `.env` table, offline license key flow
  (Ed25519 `keypair`/`issue`/verify + tiers + rotation), architecture, the 7
  GitHub Actions secrets, and the security model.
- ✅ **`.env.example`** — corrected the header to document BOTH `.env.local`
  (local dev) and `.env` (Docker), and added `POSTGRES_*` vars.
- ✅ `README_ENTERPRISE.md`, `docs/*` (DATA_FLOW_AUDIT, BUG_AUDIT, etc.) remain as deep references.

---

## 3. Codebase & Security Hygiene

| Check | Result |
|-------|--------|
| Live secrets in tracked source | ✅ none (regex sweep for Groq/Supabase keys, JWTs, PEM private keys) |
| `.env*` / `data/` tracked | ✅ untracked (gitignored) |
| Private license key tracked | ✅ untracked (`data/license-private.pem` → `/data/` ignored) |
| `.dockerignore` | ✅ excludes `.env*`, `data`, `*.md`, `__pycache__`, `*.pyc`, e2e artifacts |

> **Note:** this workspace is not currently a git repository (no `.git`), so
> there is no commit history to sweep. The `.gitignore` + `.dockerignore` are
> in place and correct for when the buyer initializes a repo.

---

## 4. Build Validation

| Command | Result |
|---------|--------|
| `tsc --noEmit` | ✅ 0 errors |
| `next lint` | ✅ 0 warnings/errors |
| `next build` (standalone) | ✅ green |
| Python `py_compile` (bridge + engine) | ✅ clean |

---

## ⚠️ External actions required (not verifiable in this sandbox)

1. **Docker bring-up** — Docker Engine is not installed in the sandbox, so
   `docker compose up -d --build` was **validated structurally** (YAML parsed,
   contexts/COPY paths/healthchecks verified) but not literally executed. Run it
   on a Docker host:
   ```bash
   cp .env.example .env   # fill in secrets
   docker compose up -d --build
   docker compose ps      # both app + bridge should be "healthy"
   ```

2. **Supabase DB migrations** — apply these (idempotent, in SQL Editor) if not yet done:
   - `supabase/CREATE_MISSING_TABLES.sql`
   - `supabase/RECONCILE_COLUMNS.sql`
   - `supabase/AUTH_TENANT_HARDENING.sql` (per-user org provisioning — required by `e2e/auth.spec.ts`)
   - `supabase/RLS_FIX_FOUR_TABLES.sql` (decision needed on `user_invoices.email` vs `user_id`)

3. **GitHub Secrets** — add the 7 secrets listed in README.md → CI/CD section.

4. **Rotate leaked credentials** — the Supabase publishable/secret keys and Groq
   key were pasted in chat earlier this session; rotate them before public launch.

---

## Final verdict

All **in-repo** launch criteria pass. The only remaining steps are external
(Docker host run, one-time DB migrations, GitHub secrets, key rotation). The
codebase, deployment stack, and documentation are launch-clean.
