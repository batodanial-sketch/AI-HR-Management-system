#!/usr/bin/env bash
#
# Fluxentiq — preflight validation suite (8 gates).
#
# Runs every quality gate across the entire repository in one command and
# fails CI with a non-zero exit code if ANY gate fails. Idempotent — safe to
# run locally or in GitHub Actions.
#
# Gates:
#   1. Main TypeScript         — tsc --noEmit (zero-tolerance)
#   2. ESLint                  — next lint (zero-tolerance)
#   3. Production build        — next build (standalone output)
#   4. Standalone verification — .next/standalone/server.js emitted
#   5. Python syntax           — compileall on server.py + bridge + python_engine
#   6. Zero `as any`           — no bare `as any` assertions in app/src/lib
#   7. Secret scan             — no live keys/JWTs/private keys in source
#   8. Desktop shell typecheck — tsc -p electron-app/tsconfig.typecheck.json
#
# Usage:
#   bash scripts/preflight.sh
#   npm run preflight          (if the script is wired into package.json)
#
set -uo pipefail

PASSED=0
FAILED=0
FAILED_GATES=()

# ─────────────────────────────────────────────────────────────────────────────
run_gate() {
  local num="$1" name="$2"
  shift 2
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Gate ${num}: ${name}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if "$@"; then
    echo "✅ Gate ${num} passed — ${name}"
    PASSED=$((PASSED + 1))
  else
    echo "❌ Gate ${num} FAILED — ${name}"
    FAILED=$((FAILED + 1))
    FAILED_GATES+=("Gate ${num}: ${name}")
  fi
}

# ── Gate helpers (inverted-logic gates return 1 on failure) ──────────────────
gate_as_any() {
  local count
  count="$(grep -rn "as any\b" app src lib components \
    --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v node_modules | wc -l | tr -d '[:space:]')"
  if [ "${count:-0}" -eq 0 ]; then
    echo "  0 bare 'as any' assertions found."
    return 0
  fi
  echo "  ${count} bare 'as any' assertion(s) found (must be 0):"
  grep -rn "as any\b" app src lib components \
    --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules
  return 1
}

gate_secrets() {
  local matches
  # Scans application SOURCE only (app, src, lib, components, server.py, bridge,
  # python_engine). `scripts/` is intentionally excluded: it contains this very
  # regex literal (self-match), and the scripts read keys from env — none
  # hardcode secrets.
  matches="$(grep -rEn \
    "gsk_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|sb_publishable_[A-Za-z0-9_-]{20,}|eyJhbGciOiJIUzI1Ni|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----" \
    app src lib components server.py bridge python_engine \
    --include="*.ts" --include="*.tsx" --include="*.py" \
    2>/dev/null)"
  if [ -z "${matches}" ]; then
    echo "  No live secrets, API keys, JWTs, or private keys found in source."
    return 0
  fi
  echo "  Secret-like patterns found in source (must be removed):"
  echo "${matches}"
  return 1
}

gate_standalone() {
  if [ -f ".next/standalone/server.js" ]; then
    echo "  .next/standalone/server.js present."
    return 0
  fi
  echo "  .next/standalone/server.js missing (next build must emit standalone output)."
  return 1
}

gate_python() {
  if python3 -m compileall -q server.py bridge python_engine; then
    echo "  Python syntax OK across server.py, bridge/, python_engine/."
    return 0
  fi
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
echo "Fluxentiq preflight — 8-gate validation suite"
echo "Node: $(node --version 2>/dev/null || echo 'unknown') · Python: $(python3 --version 2>/dev/null || echo 'unknown')"

run_gate 1 "Main TypeScript (tsc --noEmit)" \
  npm run typecheck

run_gate 2 "ESLint (next lint)" \
  npm run lint

run_gate 3 "Production build (next build, standalone)" \
  npm run build

run_gate 4 "Standalone output verification" \
  gate_standalone

run_gate 5 "Python syntax (compileall)" \
  gate_python

run_gate 6 "Zero \`as any\` assertions" \
  gate_as_any

run_gate 7 "Secret scan" \
  gate_secrets

run_gate 8 "Desktop shell typecheck (Electron)" \
  node_modules/.bin/tsc -p electron-app/tsconfig.typecheck.json

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Preflight complete: ${PASSED} passed, ${FAILED} failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for gate in "${FAILED_GATES[@]}"; do
  echo "  ❌ ${gate}"
done

if [ "${FAILED}" -ne 0 ]; then
  echo ""
  echo "Preflight FAILED — ${FAILED} gate(s) did not pass. Fix the above and re-run."
  exit 1
fi

echo ""
echo "All 8 gates passed. ✅"
exit 0
