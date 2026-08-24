# Fluxentiq — Production Go-Live Checklist

The final steps to take Fluxentiq from this workspace to a live, sellable
deployment. Ordered; do them top-to-bottom. **Items marked 🔑 require your own
credentials — they cannot be done from this workspace.**

---

## 1. 🔑 Provision Supabase (canonical database)

1. Create a project at https://supabase.com/dashboard
2. Note the **Project Ref**, **Project URL**, and the **anon** + **service_role** keys.
3. `supabase login` then `supabase link --project-ref <ref>` (or edit
   `supabase/config.toml`).
4. Apply the reconciled schema + seed:

   ```bash
   bash scripts/apply-migrations.sh
   ```

   This runs all 27 migrations in order — including
   `20260817001200_schema_reconciliation.sql`, which is idempotent and makes
   the live schema serve both the legacy and canonical column names.

## 2. 🔑 Environment & secrets

Copy `.env.example` → `.env.local` and fill in:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server-only) |
| `LLM_PROVIDER` / `LLM_API_KEY` | `openai` / `groq` / `gemini` / `anthropic` / `custom` |
| `CRON_SECRET` | random string for `/api/system/cron` |

## 3. 🔑 Rotate the license keypair

The keypair in this workspace was generated in-session and is effectively
burned. Generate a fresh one and re-issue customer keys:

```bash
node scripts/license-tool.mjs keypair          # → data/license-private.pem
# set LICENSE_PUBLIC_KEY in .env.local to the printed PUBLIC key
node scripts/license-tool.mjs issue --tier enterprise --org "Acme" --email owner@acme.com --users 500
```

## 4. Deploy

```bash
docker compose up -d --build
# or: bash install.sh   (guided VPS setup)
```

## 5. Smoke test

```bash
bash scripts/smoke-test.sh https://your-domain
```

## 6. E2E verification

```bash
npx playwright test          # requires E2E_TEST_USER_EMAIL/PASSWORD + Supabase env
```

---

## Honest scope note

This workspace cannot provision a live Supabase project, apply migrations to
*your* account, or rotate *your* live BYOK keys — those actions require your
credentials. Steps 1–3 above are the exact commands to run them yourself; the
scripts in `scripts/` encapsulate them so they're one command each.
