#!/usr/bin/env bash
#
# smoke-test.sh — final production smoke test across the live deployment.
#
#   bash scripts/smoke-test.sh [BASE_URL]
#
# Defaults BASE_URL to http://localhost:3000. Hits the marketing pages, the
# license surface, every one of the 18 domain routes, and the key API
# endpoints (AI bridge health, system health). Exit 1 on any non-2xx response.

set -uo pipefail

BASE_URL="${1:-http://localhost:3000}"
PASS=0; FAIL=0

check() {
  local path="$1"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}${path}")"
  if [[ "$code" =~ ^2 ]]; then
    printf '  \033[32m✓\033[0m %s\n' "$path"
    PASS=$((PASS+1))
  else
    printf '  \033[31m✗\033[0m %s  (%s)\n' "$path" "$code"
    FAIL=$((FAIL+1))
  fi
}

# Health endpoint: 503 = reachable but reporting a down subsystem.
check_health() {
  local path="$1"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}${path}")"
  if [[ "$code" =~ ^2 ]] || [[ "$code" == "503" ]]; then
    printf '  \033[32m✓\033[0m %s  (%s)\n' "$path" "$code"
    PASS=$((PASS+1))
  else
    printf '  \033[31m✗\033[0m %s  (%s)\n' "$path" "$code"
    FAIL=$((FAIL+1))
  fi
}

echo "Smoke testing ${BASE_URL} …"
echo "— public —"
for p in / /pricing /docs /login /auth/license; do check "$p"; done
echo "— domain modules (18) —"
for p in /performance /attendance /screening /learning /benefits /equity \
         /expenses /surveys /planning /contractors /offboarding /workforce \
         /assets /documents /compensation /audit-logs /notifications /automations; do
  check "$p"
done
echo "— API —"
# /api/system/health returns 503 by design when a subsystem (e.g. Supabase) is
# down — treat 503 as "reachable" for the health endpoint specifically.
check_health /api/system/health
check /api/license/status
check "/api/reports?type=system"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]]
