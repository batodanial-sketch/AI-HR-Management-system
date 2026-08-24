# Fluxentiq — Live End-to-End Audit Report

**Date:** 2026-08-19
**Project:** `zeroaswkxyvcsoxtiyqs` (`https://zeroaswkxyvcsoxtiyqs.supabase.co`)
**Environment:** Local app (`localhost:3000`) → live Supabase

---

## Summary

| # | Check | Result |
|---|-------|--------|
| 1 | Manual email/password signup (trigger) | ✅ PASS |
| 2 | Manual email/password sign-in | ✅ PASS |
| 3 | `profiles` row auto-generated on signup | ✅ PASS |
| 4 | `memberships` row defaults to `member` (lowercase) | ✅ PASS |
| 5 | `/dashboard` resolves live session (no demo fallback) | ✅ PASS |
| 6 | `/auth/callback` route wired correctly | ✅ PASS |
| 7 | Google OAuth enabled in Supabase | ❌ FAIL — still disabled |

---

## Detailed results

### ✅ 1 & 2 — Manual signup + sign-in (trigger no longer crashes)

```
POST /api/auth/signup
→ {"ok":true}  HTTP 200
→ Set-Cookie: fluxentiq.trial=valid
→ Set-Cookie: sb-zeroaswkxyvcsoxtiyqs-auth-token=<session>
```

Password sign-in (GoTrue `grant_type=password`) also succeeds for the new user.

**Verdict:** The `FIX_SIGNUP_TRIGGER.sql` fix is confirmed live — user creation
no longer throws "Database error creating new user".

### ✅ 3 — `profiles` row auto-generated

| column | value |
|--------|-------|
| id | `<uuid>` (matches auth.users) |
| email | audit user email |
| full_name | "Audit Manual <ts>" |

The legacy `public.users` row is also created (satisfies the `profiles.id` FK).

### ✅ 4 — `memberships` defaults to `member` (lowercase)

```
{ user_id: <uuid>, organization_id: 409458f5-…, role: "member" }
```

Default membership is attached to the first organization with lowercase
`member` role — exactly as the security hardening intended.

### ✅ 5 — `getCurrentUser()` resolves live session on `/dashboard`

- `/dashboard` returns **HTTP 200** with a valid session cookie.
- Rendered page contains the **live user's email**.
- No `ayesha.rahman@fluxentiq.test` demo fallback.
- No "demo mode" banner.

**Verdict:** `getCurrentUser()` → session → `profiles` → `memberships` all
resolve against live Supabase. No demo fallback triggered.

### ✅ 6 — `/auth/callback` route

- No `code` → `307 /login?error=invalid_callback` (correct).
- Bogus `code` → `307 /login?error=PKCE code verifier not found…` (correct —
  the route is attempting the code exchange and surfacing GoTrue's error).

The callback route is wired correctly; it is *not* the blocker for Google.

---

## ❌ 7 — Google OAuth is NOT enabled (the one open item)

Ground-truth check against the live GoTrue service:

```
GET /auth/v1/settings → "external": { "google": false, … }

GET /auth/v1/authorize?provider=google&redirect_to=…
→ 400 { "error_code": "validation_failed",
        "msg": "Unsupported provider: provider is not enabled" }
```

**This means the Google provider is still switched OFF in Supabase**, even
though the Client ID/Secret may have been pasted. The most common cause: the
**"Enable Sign in with Google" toggle at the top of the provider page was not
flipped to ON**, or the change was saved against a different project.

### To fix (2 minutes)

1. Open **Authentication → Providers → Google** for project `zeroaswkxyvcsoxtiyqs`.
2. Confirm the **Enable Sign in with Google** switch is **ON** (not just the
   Client ID / Secret filled in).
3. Paste the Client ID and Client Secret (from Google Cloud Console).
4. **Save**.
5. (Optional but important) **Authentication → URL Configuration** →
   Site URL = your app origin, and add the redirect URL:
   `http://localhost:3000/auth/callback` (and your production domain).

Then tell me and I'll re-run this check — the authorize endpoint should return
a `302` to `accounts.google.com` once it's live.

---

## Notes

- Two test users were created during this audit (`audit.manual.*@gmail.com`).
  They are harmless `member`-role accounts; delete them from the Auth users
  table if you want a clean slate.
- The app code (signup, sign-in, callback, trial sync) is all verified working.
  The only remaining external dependency is flipping Google ON in Supabase.
