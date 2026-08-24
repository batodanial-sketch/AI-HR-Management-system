#!/usr/bin/env bash
#
# apply-migrations.sh — apply the reconciled Fluxentiq schema to a live
# Supabase instance (production go-live, Phase 2).
#
#   bash scripts/apply-migrations.sh
#
# Requirements:
#   - supabase CLI installed (`npm i -g supabase`) and logged in
#     (`supabase login` + `supabase link --project-ref <ref>`)
#   - the target project linked via supabase/config.toml
#
# What it does:
#   1. Confirms the CLI is authenticated and linked.
#   2. Applies every migration in supabase/migrations/ in order — including
#      20260817001200_schema_reconciliation.sql (idempotent ADD COLUMN IF NOT
#      EXISTS), which makes the live schema serve the canonical app.
#   3. Runs supabase/seed.sql (demo data).

set -euo pipefail

log()  { printf '\033[1;34m[go-live]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[go-live]\033[0m %s\n' "$*" >&2; exit 1; }

command -v supabase >/dev/null 2>&1 || fail "supabase CLI not found. Install: npm i -g supabase"

log "Checking Supabase link status…"
supabase projects list >/dev/null 2>&1 || fail "Not logged in. Run: supabase login"

log "Applying all migrations (including schema reconciliation)…"
supabase db push || fail "Migration push failed. Resolve any drift and re-run."

log "Applying seed data…"
supabase db reset --linked || fail "Seed failed."

log "Done. Verify with: supabase migration list"
log "Then run: bash scripts/smoke-test.sh"
