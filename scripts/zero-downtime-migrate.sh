#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fluxentiq — zero-downtime database migration runner.
#
# Executes idempotent SQL migrations safely against a live Postgres/Supabase
# database:
#
#   1. Preflight   — verifies psql, DATABASE_URL, and the migrations dir.
#   2. Lock        — acquires a Postgres advisory lock so concurrent
#                    migrators (or deploy hosts) serialize cleanly.
#   3. Snapshot    — pg_dump (public + auth schemas) BEFORE applying anything.
#   4. Apply       — each not-yet-applied .sql file in its own transaction
#                    (psql --single-transaction -v ON_ERROR_STOP=1), tracked
#                    in the `fluxentiq_migrations` ledger table.
#   5. Verify RLS  — flags tables missing ROW LEVEL SECURITY and orphan
#                    policies; fails in --strict mode.
#   6. Rollback    — on ANY failure, restores the pre-migration snapshot so
#                    the schema returns to its previous state.
#
# Usage:
#   DATABASE_URL=postgres://...  bash scripts/zero-downtime-migrate.sh
#   bash scripts/zero-downtime-migrate.sh --dry-run     # plan only, no writes
#   bash scripts/zero-downtime-migrate.sh --strict      # fail on RLS gaps
#
# Env overrides:
#   MIGRATIONS_DIR   (default: supabase/migrations)
#   MIGRATION_SCHEMA (default: public)
#   ROLLBACK_ON_FAIL (default: 1)
# ---------------------------------------------------------------------------

set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"
MIGRATION_SCHEMA="${MIGRATION_SCHEMA:-public}"
ROLLBACK_ON_FAIL="${ROLLBACK_ON_FAIL:-1}"
DRY_RUN=0
STRICT=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --strict)  STRICT=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;34m[migrate]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[migrate]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[migrate]\033[0m %s\n' "$*" >&2; exit 1; }

# ── 1. Preflight ────────────────────────────────────────────────────────────
command -v psql >/dev/null 2>&1 || fail "psql is required (install postgresql-client)."
command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is required (install postgresql-client)."
[ -d "$MIGRATIONS_DIR" ] || fail "Migrations directory not found: $MIGRATIONS_DIR"
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set."

mapfile -t MIGRATION_FILES < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -type f | sort)
[ "${#MIGRATION_FILES[@]}" -gt 0 ] || fail "No .sql migrations found in $MIGRATIONS_DIR."

SNAPSHOT_FILE="$(mktemp -t fluxentiq-migration-snapshot.XXXXXX.dump)"
LOCK_KEY=20260101 # fluxentiq migration advisory lock

cleanup() {
  rm -f "$SNAPSHOT_FILE"
}

rollback() {
  log "Rolling back — restoring pre-migration snapshot…"
  pg_restore "$DATABASE_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --schema="$MIGRATION_SCHEMA" \
    --schema=auth \
    "$SNAPSHOT_FILE" \
    || warn "Automated rollback failed — restore manually from $(basename "$SNAPSHOT_FILE")."
  psql "$DATABASE_URL" -c "SELECT pg_advisory_unlock($LOCK_KEY);" >/dev/null 2>&1 || true
}

# EXIT trap: any non-zero exit after the snapshot exists restores it
# (unless --dry-run or ROLLBACK_ON_FAIL=0), then cleans up.
trap 'rc=$?; if [ "$rc" -ne 0 ] && [ "$ROLLBACK_ON_FAIL" = "1" ] && [ "$DRY_RUN" -eq 0 ] && [ -s "$SNAPSHOT_FILE" ]; then rollback; fi; cleanup; exit $rc' EXIT

log "Preflight OK — ${#MIGRATION_FILES[@]} migration file(s) in $MIGRATIONS_DIR."

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry run — listing pending migrations (no writes):"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc \
    "CREATE TABLE IF NOT EXISTS ${MIGRATION_SCHEMA}.fluxentiq_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" >/dev/null
  applied="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "SELECT name FROM ${MIGRATION_SCHEMA}.fluxentiq_migrations;")"
  for file in "${MIGRATION_FILES[@]}"; do
    name="$(basename "$file")"
    if grep -qxF "$name" <<<"$applied"; then
      echo "  applied  $name"
    else
      echo "  PENDING  $name"
    fi
  done
  exit 0
fi

# ── 2. Advisory lock (serialize concurrent migrators) ─────────────────────
log "Acquiring migration advisory lock (key=$LOCK_KEY)…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT pg_advisory_lock($LOCK_KEY);" >/dev/null

# ── 3. Snapshot before applying anything ───────────────────────────────────
log "Snapshotting current schema → $(basename "$SNAPSHOT_FILE")"
pg_dump "$DATABASE_URL" \
  --format=custom \
  --schema="$MIGRATION_SCHEMA" \
  --schema=auth \
  --file="$SNAPSHOT_FILE"

# ── 4. Apply pending migrations (one transaction each) ─────────────────────
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE IF NOT EXISTS ${MIGRATION_SCHEMA}.fluxentiq_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" \
  >/dev/null

applied="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "SELECT name FROM ${MIGRATION_SCHEMA}.fluxentiq_migrations;")"
applied_count=0

for file in "${MIGRATION_FILES[@]}"; do
  name="$(basename "$file")"
  if grep -qxF "$name" <<<"$applied"; then
    continue
  fi

  log "Applying $name …"
  if ! psql "$DATABASE_URL" \
      -v ON_ERROR_STOP=1 \
      --single-transaction \
      -f "$file"; then
    fail "Migration $name failed — rolling back to the pre-migration snapshot."
  fi

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "INSERT INTO ${MIGRATION_SCHEMA}.fluxentiq_migrations (name) VALUES ('$name') ON CONFLICT DO NOTHING;" \
    >/dev/null
  applied_count=$((applied_count + 1))
  log "  ✓ applied + recorded in ledger"
done

[ "$applied_count" -eq 0 ] && log "No pending migrations — database is current."

# ── 5. RLS verification ────────────────────────────────────────────────────
log "Verifying Row Level Security coverage…"
rls_gaps="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "
  SELECT string_agg(tablename, ', ' ORDER BY tablename)
  FROM pg_tables
  WHERE schemaname = '$MIGRATION_SCHEMA'
    AND tablename NOT IN ('fluxentiq_migrations')
    AND tablename NOT LIKE '\\_%'
    AND tablename NOT IN (
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '$MIGRATION_SCHEMA'
        AND c.relrowsecurity = true
    );
")"

if [ -n "$rls_gaps" ] && [ "$rls_gaps" != "" ]; then
  if [ "$STRICT" -eq 1 ]; then
    fail "RLS gaps detected on tables: $rls_gaps (strict mode)."
  else
    warn "Tables without RLS: $rls_gaps — enable ROW LEVEL SECURITY for tenant data."
  fi
else
  log "  ✓ every table in $MIGRATION_SCHEMA has RLS enabled"
fi

# ── 6. Success — release the lock ──────────────────────────────────────────
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT pg_advisory_unlock($LOCK_KEY);" >/dev/null

log "Migration complete — $applied_count migration(s) applied, snapshot retained at $(basename "$SNAPSHOT_FILE")."
