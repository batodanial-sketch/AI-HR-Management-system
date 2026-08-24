#!/usr/bin/env bash
#
# run-e2e-local.sh — boot the Fluxentiq AI HR stack and launch the Playwright
# E2E suite against a local Supabase instance.
#
#   Prerequisites: supabase CLI, Node 20+, npm deps installed, and the
#   environment variables below (copy .env.example → .env.local).
#
#   Steps:
#     1. Validate environment.
#     2. Start Supabase and apply migrations 000300 + 000400 (plus seeds).
#     3. Boot the Python server.py bridge and the Next.js dev server.
#     4. Run Playwright (UI mode by default).
#     5. Tear everything down on exit.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log()  { printf '\033[1;34m[run-e2e]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[run-e2e]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Environment validation
# ---------------------------------------------------------------------------
for var in NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY E2E_TEST_USER_EMAIL E2E_TEST_USER_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    fail "Missing required environment variable: ${var}"
  fi
done

command -v supabase >/dev/null 2>&1 || fail "supabase CLI not found. Install: npm i -g supabase"
command -v node >/dev/null 2>&1        || fail "node not found."
command -v python3 >/dev/null 2>&1     || fail "python3 not found."

# ---------------------------------------------------------------------------
# 2. Supabase: start + apply migrations 000300 (access requests) and 000400
# ---------------------------------------------------------------------------
log "Starting local Supabase…"
supabase start >/dev/null 2>&1 || true

log "Applying migrations 000300 and 000400…"
supabase migration up --local --linked >/dev/null 2>&1 || true
supabase db reset >/dev/null 2>&1 || true

log "Exporting local Supabase credentials…"
if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || "$NEXT_PUBLIC_SUPABASE_URL" == *".supabase.co"* ]]; then
  export NEXT_PUBLIC_SUPABASE_URL="$(supabase status -o env | sed -n 's/^API_URL=//p')"
fi
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=//p')"
fi
export SUPABASE_PROJECT_REF="local"

# ---------------------------------------------------------------------------
# 3. Boot server.py bridge + Next.js dev server
# ---------------------------------------------------------------------------
cleanup() {
  log "Shutting down…"
  [[ -n "${NEXT_PID:-}" ]] && kill "${NEXT_PID}" 2>/dev/null || true
  [[ -n "${BRIDGE_PID:-}" ]] && kill "${BRIDGE_PID}" 2>/dev/null || true
  supabase stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

log "Starting Python bridge (server.py)…"
python3 server.py &
BRIDGE_PID=$!

log "Starting Next.js dev server…"
npm run dev &
NEXT_PID=$!

log "Waiting for http://localhost:3000 …"
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ---------------------------------------------------------------------------
# 4. Playwright
# ---------------------------------------------------------------------------
MODE="${1:-ui}"
case "$MODE" in
  ui)
    log "Launching Playwright UI…"
    npx playwright test --ui
    ;;
  headless)
    log "Running Playwright headless…"
    npx playwright test
    ;;
  headed)
    log "Running Playwright headed…"
    npx playwright test --headed
    ;;
  *)
    fail "Unknown mode: ${MODE} (expected ui|headless|headed)"
    ;;
esac
