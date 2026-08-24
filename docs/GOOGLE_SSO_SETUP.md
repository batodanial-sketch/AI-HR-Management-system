# Google Sign-In (SSO) — Setup Guide

Project ref: `zeroaswkxyvcsoxtiyqs`
Supabase URL: `https://zeroaswkxyvcsoxtiyqs.supabase.co`

Verified live 2026-08-19: Google provider is **disabled** (`"google": false`).
Follow these steps to turn it on. The app-side code is already wired correctly
(`signInWithOAuth` → `/auth/callback?next=/dashboard&trial=true`).

---

## Step 1 — Create a Google Cloud OAuth client (~5 min)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project (or pick an existing one).
3. **APIs & Services → OAuth consent screen** → choose **External** (or Internal
   if you use Google Workspace) → fill app name + your support email → add your
   domain to "Authorized domains" → save.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID →**
   **Application type = Web application**.
5. Under **Authorized redirect URIs**, add exactly:

   ```
   https://zeroaswkxyvcsoxtiyqs.supabase.co/auth/v1/callback
   ```

6. Click **Create**. Copy the **Client ID** and **Client Secret**.

---

## Step 2 — Enable Google in Supabase

1. Open https://supabase.com/dashboard/project/zeroaswkxyvcsoxtiyqs
2. **Authentication → Providers → Google**.
3. Toggle **Enable Sign in with Google** to ON.
4. Paste **Client ID** and **Client Secret** from Step 1.
5. **Save**.

---

## Step 3 — Allow redirect URLs (so the OAuth round-trip lands back in the app)

1. **Authentication → URL Configuration**.
2. Set **Site URL** to your app origin (for local testing: `http://localhost:3000`).
3. Under **Redirect URLs**, add (one per line):

   ```
   http://localhost:3000/auth/callback
   https://YOUR_PRODUCTION_DOMAIN/auth/callback
   ```

   > For local dev, `http://localhost:3000/**` also works as a wildcard.

4. **Save**.

---

## Step 4 — Verify (do this after Steps 1–3)

1. Start the app (`npm run dev` on `:3000`).
2. Go to `/auth/license` → **Continue with 15-Day Free Trial** → `/signup`.
3. Click **Continue with Google**.
4. Pick your Google account → you should land on `/dashboard` with a trial
   banner (15-day countdown).

---

## Alternative: enable Google programmatically (if you prefer not to click the Dashboard)

If you paste a Supabase **personal access token** (Dashboard → Account →
Access Tokens → Generate new token, starts with `sbp_`), the following
Management API call enables the provider + sets credentials:

```bash
curl -X PATCH \
  "https://api.supabase.com/v1/projects/zeroaswkxyvcsoxtiyqs/config/auth" \
  -H "Authorization: Bearer sbp_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_google_enabled": true,
    "external_google_client_id": "YOUR_GOOGLE_CLIENT_ID",
    "external_google_secret": "YOUR_GOOGLE_CLIENT_SECRET"
  }'
```

---

## Note on manual (email/password) sign-up

Manual sign-up is a **separate issue** and is still blocked by the live
`handle_new_user` trigger. Run `supabase/FIX_SIGNUP_TRIGGER.sql` in the SQL
Editor to fix it — that has nothing to do with Google SSO or email hooks.
