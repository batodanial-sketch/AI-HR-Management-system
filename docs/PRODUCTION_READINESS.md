# Fluxentiq — Production Readiness & Performance Refactor

**Date:** 2026-08-20
**Role:** Senior Software Architect / Performance Optimization pass
**Result:** `tsc --noEmit` 0 errors · `next lint` 0 warnings/errors · `next build` green · all routes verified live.

---

## 1. Performance audit — findings & fixes

### 1a. Auth-guard latency (root layout + middleware) — FIXED

**Problem:** The root layout resolved `getCurrentUser()` (up to 3 Supabase round-trips: session → profile → membership) and `getLicenseState()` on **every** route — including the marketing landing, pricing, docs, `/login`, `/signup` and `/auth/license`, where none of it is used. Combined with the middleware's `getUser()` this meant public pages paid 1–4 network round-trips before first paint.

**Fix:**
- `middleware.ts` now threads an `x-pathname` request header through every `next()`.
- `app/layout.tsx` reads it and **skips** auth + license resolution entirely on public surfaces (`/`, `/pricing`, `/docs`, `/login`, `/signup`, `/auth`), passing `null` to `Providers` — `useUser()`/`useLicense()` fall back to their safe defaults client-side.
- Verified live: marketing/auth pages return 200 with no auth dependency; protected routes still redirect correctly (`/dashboard` → `/auth/license` or `/login`).

### 1b. `readSettings()` uncached — FIXED

**Problem:** `lib/settings/config.ts` read + JSON-parsed `data/settings.json` from disk on every call, and it was called 2–3× per request (root layout, marketing layout, `generateMetadata`).

**Fix:** Added a module-level TTL cache (3 s), invalidated immediately on `writeSettings()`. Reads are now near-free; settings changes still propagate within seconds.

### 1c. Bundle & assets

- No chart library to lazy-load — all charts are custom inline SVG (no `recharts`/`d3`/`chart.js` in deps), so there's no heavy chart chunk to split.
- `framer-motion` + the Copilot drawer ship in the shared bundle because `Providers`/`AppShell` mount `CopilotProvider` on every route (including auth pages, which don't need it). **Documented as the next split target** — deferred because it would touch the E2E `copilot-trigger-button` contract and needs careful verification.
- `optimizePackageImports: ["lucide-react"]` is already configured in `next.config.mjs`.

### 1d. API / bridge

- AI features already stream (SSE) end-to-end: Next `/api/ai/*` → Python bridge (async `httpx` streaming) → client — no event-loop blocking in the bridge.
- Memory adapter reads are tenant-scoped by `organization_id` (`orgFilter()`).
- **Recommended (not yet applied):** add indices on `organization_id`, `user_id`, and FK columns. See §4.

### 1e. State / re-renders — already clean

`components/providers.tsx` already memoizes context values with `useMemo` and stabilizes setters with `useCallback`; `getCurrentUser` is wrapped in React `cache()`. No unnecessary re-render sources found.

---

## 2. UI/UX refinement

| Item | Status |
|------|--------|
| Skeleton loaders (CLS) | ✅ Already present — `app/loading.tsx` (route-level, reserves card/stat/table space) + `components/ui/skeleton.tsx`, applied across all 18 modules via the root loader. |
| Route transitions | ✅ Auth cards already animate entry via `framer-motion` (`motion.div`). `AnimatePresence` is used in the Copilot drawer. No further churn needed at this risk level. |
| Form & action feedback | ✅ `login-form`, `signup-form`, `license-form` all have pending spinners (`Loader2`), inline validation (zod + client checks) and inline error banners. `invalid_callback` errors from `/auth/callback` surface in the login form via `searchParams`. |

---

## 3. Branding decoupling — DONE

Hardcoded **"Groq"** vendor branding removed/replaced with the neutral **"AI Copilot"** label:

| File | Change |
|------|--------|
| `components/auth/login-form.tsx` | removed "Powered by Groq AI Copilot" footer |
| `components/auth/signup-form.tsx` | removed "Powered by Groq AI Copilot" footer |
| `components/copilot/copilot-provider.tsx` | "Groq Copilot" → "AI Copilot" + doc update |
| `app/(marketing)/page.tsx` | "Groq Copilot" → "AI Copilot" |
| `lib/data.ts` | seed activity actor "Groq Copilot" → "AI Copilot" |
| `components/layout/top-nav.tsx` | doc comment updated |

**Provider abstraction already exists** (no new file needed — the request's `lib/ai/copilot-provider.ts` is already satisfied by):
- `lib/ai-client.ts` / `lib/ai-proxy.ts` (Next side) → `bridge/providers/{base,openai_compat,anthropic}.py` (vendor-agnostic BYOK layer). The LLM vendor is resolved at runtime from Settings → AI Provider, so the UI carries zero vendor branding.

---

## 4. Production readiness

### 4a. CI/CD — added `ci.yml` (zero-tolerance gate)
New `.github/workflows/ci.yml` runs on push/PR: `tsc --noEmit` → `eslint` → `next build`. (Previously CI only ran Playwright.)

### 4b. ESLint — added
- Installed `eslint@8` + `eslint-config-next@14.2.35` (the versions Next 14 requires).
- Added `.eslintrc.json` (extends `next/core-web-vitals`) and `.eslintignore` (excludes legacy `src/`, `electron-app/`, `python_engine/`, `bridge/`, etc.).
- **Fixed a latent bug while linting:** `lib/health.ts` used `require("../../package.json")` — the wrong path, so `appVersion()` silently returned `"1.0.0"` forever. Replaced with a type-safe `import packageJson from "../package.json"`.

### 4c. Global error handling
- `app/error.tsx` (route boundary) already sanitized (logs `digest`/`message`, never full error objects).
- **Added `app/global-error.tsx`** — a root-layout error boundary Next.js requires for errors thrown above `app/error.tsx`; renders a minimal on-brand fallback with a retry button.

### 4d. RLS verification — added `supabase/VERIFY_RLS.sql`
Idempotent script to run in the SQL Editor:
1. Lists any table with RLS **disabled**.
2. Enables RLS and applies a `tenant_isolation` policy (via `is_organization_member(organization_id)`) to every org-scoped table missing one.
3. Adds self-scoped policies for `profiles` and `memberships`.
4. Re-runs the preflight — should report **zero** unprotected tables.

---

## Verified live (post-refactor)

| Route | Expected | Actual |
|-------|----------|--------|
| `/`, `/pricing`, `/docs` | 200, no auth | 200 ✅ |
| `/login`, `/signup`, `/auth/license` | 200, no auth | 200 ✅ |
| `/dashboard` (no cookies) | 307 → `/auth/license` | ✅ |
| `/dashboard` (trial cookie, no session) | 307 → `/login` | ✅ |

---

## Remaining recommendations (not blocking, need buyer/DB access)

1. **DB indices** — `CREATE INDEX ... ON <table>(organization_id)` and on `user_id`/FK columns for hot tables (`employees`, `candidates`, `leave_requests`, `payroll_line_items`, `memberships`).
2. **Bundle split of `CopilotProvider`** so auth/marketing pages don't ship the drawer (needs E2E re-verification).
3. **Rotate leaked `SUPABASE_SERVICE_ROLE_KEY` + Groq key** (still outstanding from earlier).
4. **Health endpoint** (`/api/system/health`) is license-gated — consider making it public for uptime monitors.
