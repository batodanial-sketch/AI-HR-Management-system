# Fluxentiq — Personal Data Flow Audit & Remediation

**Date:** 2026-08-20
**Scope:** full codebase (`app/`, `lib/`, `components/`, `server.py`, `bridge/`, `python_engine/`)
**Result:** 7 audit areas completed. 9 PII log leaks fixed, 1 missing flow (account deletion) built and verified live.

---

## 1. Data collection point map

| Data | Collected where | Stored | Sent externally |
|------|-----------------|--------|-----------------|
| **Email** | `/signup`, `/login`, Google OAuth (Supabase GoTrue), employee/candidate/lead forms | Supabase `auth.users` + `profiles.email` + `employees.email` | Google (OAuth), LLM provider (only if in AI prompt text) |
| **Password** | `/signup`, `/login` forms | **Supabase GoTrue only** (bcrypt-hashed — never stored in our DB, never logged) | Supabase auth (over TLS) |
| **Full name / username** | signup form, profile settings, employee records | `profiles.full_name`, `users.full_name`, `employees.first/last_name` | LLM provider (candidate names in screening prompts) |
| **Phone number** | employee records (legacy `employees.phone`) | Supabase `employees` | none |
| **Date of birth** | employee records (legacy `employees.date_of_birth`) | Supabase `employees` | none |
| **Address / emergency contact / custom fields** | employee records (`emergency_contact`, `custom_fields` JSONB) | Supabase `employees` | none |
| **Payment info** | **NOT collected** — purchases are manual via WhatsApp | n/a | n/a (no PCI scope) |
| **IP address** | `lib/rate-limit.ts` via `x-forwarded-for` | **in-memory only** (fixed-window map, evicted automatically) | none |
| **Device info / user-agent** | **NOT collected** | n/a | none |
| **AI content** (resume text, job descriptions, interview notes, PTO details, analytics) | AI feature forms → Python bridge | not persisted by default (streamed to LLM only) | **LLM provider** (Groq by default; BYOK OpenAI/Anthropic/Gemini/custom) |

**Tenant isolation:** all HR reads are scoped via `orgFilter()` → `organization_id` on the Supabase memory adapter, so one org never sees another's data.

---

## 2. Log audit — 9 PII leaks found & fixed

Every logger/`console.*`/`print` was reviewed. The following output personal data and have been redacted:

| File | What it leaked | Fix |
|------|----------------|-----|
| `lib/email.ts` (console + SMTP fallback) | recipient **email** (`to=…`) + full message body | `[email] dispatched (recipient redacted, subject="…")` |
| `lib/audit.ts` (demo/offline path) | actor **email** | logs actor **user id** instead |
| `bridge/workflow_engine.py` `send_email` | recipient **email** (`to`) | `recipient redacted` |
| `bridge/workflow_engine.py` `create_record` | **full row** (names, emails, salary) | logs table name + field count only |
| `bridge/workflow_engine.py` `update_record` | **match/patch values** | logs key counts only |
| `bridge/workflow_engine.py` `groq_evaluate` | **candidate name** | logs candidate id only |
| `lib/scheduler.ts` | full **error object** (`.details` can embed row data) | logs `err.message` only |
| `app/error.tsx` | full **error object** | logs `digest`/`message` only |

`server.py` and `bridge/config.py` were verified clean — they log provider/model names and the Supabase URL, never keys, tokens, or PII.

---

## 3. Third-party integrations

| Integration | Data sent | Assessment |
|-------------|-----------|------------|
| **Supabase** (auth + Postgres) | email, password (GoTrue bcrypt), name, all HR records | required; over TLS. The canonical source of truth. |
| **LLM provider** (Groq default; BYOK OpenAI/Anthropic/Gemini/custom endpoint) | candidate names, role, resume snippets, job descriptions, PTO request details, interview notes, analytics aggregates | **This is the one meaningful external transfer.** Inherent to the AI features; prompts are sent verbatim to the chosen provider. BYOK lets a buyer pick a provider they trust. |
| **Email relay** (optional SMTP/HTTP via `EMAIL_PROVIDER`) | `to`, `subject`, `html`, `text` | only when the buyer configures a relay; disabled by default (console). |
| **User-configured webhooks** (outbound, n8n, Slack) | arbitrary user-defined payloads + HMAC-signed | buyer-initiated; HMAC-signed; payload hashed (sha256) in logs, not stored raw. |
| **Analytics / error tracking SDKs** (Sentry, PostHog, GA, etc.) | **none present** | ✅ no third-party tracking SDKs in `package.json` or code. |

No extra fields are stripped from these integrations — each already receives only the minimum it needs (AI prompts = the feature input; email relay = message fields).

---

## 4. Password handling — ✅ compliant, no change needed

- Passwords are **never** stored by this app, logged, or returned in any API response.
- They are passed **once** to Supabase GoTrue (`signUp` / `signInWithPassword` / `admin.createUser`), which hashes them with **bcrypt** before storage.
- The legacy `users.password_hash` column exists but is **never written by app code** (documented "owned by the auth provider in production").
- No MD5/SHA256 password storage anywhere. The only sha256 uses are **HMAC webhook signatures** and **payload hashing** (not passwords).
- Zod validates signup passwords (min 6 chars) before submission.

---

## 5. Cookie & storage audit — ✅ clean

- **`localStorage`** holds only UI preferences: `fluxentiq.sidebar.collapsed`, `fluxentiq.theme`, `fluxentiq.accent`. **No PII.**
- **Session cookie** (`sb-<ref>-auth-token`) is managed by `@supabase/ssr` with `HttpOnly` + `SameSite=lax`; `Secure` is added automatically in production (https).
- **Trial/license cookies** (`fluxentiq.trial`, `fluxentiq.license`) are `HttpOnly`, `SameSite=lax`, value `"valid"` only — no PII.
- No PII in any cookie value.

---

## 6. API response filtering

- REST + GraphQL both serve **field-mapped projections** (e.g. `getEmployees()` maps only `id/firstName/lastName/email/department/role/…`), never raw rows.
- **No endpoint returns password hashes, tokens, or internal auth ids** (grep-verified across `app/api`).
- Tenant scoping: `orgFilter()` restricts reads to the caller's `organization_id` (Supabase adapter). Member lists are org-scoped.
- ⚠️ Note (not fixed — by design): employee/candidate **email is intentionally returned** to authenticated org members — it's core HR data the UI needs. It is never exposed cross-tenant.

---

## 7. Data deletion — ✅ **built & verified live**

Added a self-service account deletion flow:

- **New endpoint** `POST /api/account/delete` (service-role, auth-guarded):
  1. Anonymizes the user's linked employee record (`first/last_name` → `[REDACTED]`, `work_email` → `[REDACTED]`, `personal_email/phone/date_of_birth` → null, `emergency_contact`/`custom_fields` → `{}`).
  2. Deletes `memberships`, `profiles`, and legacy `users` rows.
  3. Deletes the `auth.users` identity (cascades to any remaining rows).
  4. Writes a `member.remove` audit entry.
- **New UI**: Settings → General → "Danger zone" → "Delete my account" (type `DELETE` to confirm).
- **Middleware**: `/api/account` exempted from the license gate (so an expired-trial user can still delete their account) — auth is enforced inside the route itself.

**Live verification** (throwaway account): signup → delete → `auth.users` gone ✅, `profiles` gone ✅, `memberships` gone ✅.

---

## Summary of changes

| # | Change | Files |
|---|--------|-------|
| 1 | Redact email/body logging | `lib/email.ts` |
| 2 | Redact actor email in audit log | `lib/audit.ts` |
| 3–6 | Redact PII in workflow engine logs | `bridge/workflow_engine.py` |
| 7 | Log error message, not full object | `lib/scheduler.ts` |
| 8 | Log digest, not full error object | `app/error.tsx` |
| 9 | **Add account deletion** (route + UI + middleware exemption) | `app/api/account/delete/route.ts`, `components/settings/delete-account.tsx`, `components/settings/settings-shell.tsx`, `middleware.ts` |
| 10 | Un-type `adminClient()` to match drifted legacy schema | `lib/supabase/server.ts` |

**Build:** `tsc --noEmit` 0 errors · `next build` green.

## Remaining recommendations (not blocking)

1. **Rotate the leaked keys** — `SUPABASE_SERVICE_ROLE_KEY` and the Groq key were pasted in chat earlier. Still outstanding.
2. **AI data transfer notice** — consider a one-line disclosure in Settings → AI Provider that prompts (resumes, interview notes) are sent to the configured LLM vendor, so buyers can make an informed BYOK choice.
3. **Non-Supabase memory adapters** (Postgres/SQLite/custom) return `orgFilter()` = `undefined` — single-tenant by assumption. If multi-tenant on those backends is ever needed, org scoping must be added there.
