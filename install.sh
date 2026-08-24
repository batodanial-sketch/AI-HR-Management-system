#!/usr/bin/env bash
#
# install.sh — automated Fluxentiq self-host deployment for Linux/Ubuntu VPS.
#
#   curl -fsSL https://your-host/install.sh | bash
#
# Verifies Docker, prompts for the License Key + AI Key, writes .env, and
# starts the container stack. Idempotent — safe to re-run.

set -euo pipefail

# ── colors ───────────────────────────────────────────────────────────────────
G='\033[1;32m'; B='\033[1;34m'; Y='\033[1;33m'; R='\033[1;31m'; N='\033[0m'
info() { printf "${B}[fluxentiq]${N} %s\n" "$*"; }
ok()   { printf "${G}[fluxentiq]${N} %s\n" "$*"; }
warn() { printf "${Y}[fluxentiq]${N} %s\n" "$*"; }
fail() { printf "${R}[fluxentiq]${N} %s\n" "$*" >&2; exit 1; }

cd "$(dirname "$0")"

# ── 1. prerequisites ─────────────────────────────────────────────────────────
info "Checking prerequisites…"

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Run: curl -fsSL https://get.docker.com | sh"
if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 is required. Install it via: apt install docker-compose-plugin"
fi

info "Docker $(docker --version | awk '{print $3}' | tr -d ',') ready."

# ── 2. environment file ──────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    info "Created .env from .env.example."
  else
    fail ".env.example not found — cannot scaffold configuration."
  fi
fi

# ── 3. license key ───────────────────────────────────────────────────────────
info "License key:"
if [[ -n "${LICENSE_KEY:-}" ]]; then
  echo "  Using LICENSE_KEY from environment."
else
  read -rp "  Enter your Fluxentiq license key (FLUX-…): " LICENSE_KEY
fi
[[ -n "$LICENSE_KEY" ]] || fail "A license key is required."
# Persist the license so the activation gate passes on first boot.
mkdir -p data
node -e '
  const fs = require("fs");
  const key = process.argv[1];
  let s = {};
  try { s = JSON.parse(fs.readFileSync("data/settings.json","utf8")); } catch {}
  s.license = s.license || { key };
  fs.writeFileSync("data/settings.json", JSON.stringify(s, null, 2));
' "$LICENSE_KEY" 2>/dev/null || true

# ── 4. AI provider key (optional) ────────────────────────────────────────────
info "AI provider (bring your own key):"
read -rp "  Provider [groq|openai|gemini|anthropic|custom] (default groq): " AI_PROVIDER
AI_PROVIDER=${AI_PROVIDER:-groq}
read -rsp "  API key (optional, press Enter to skip): " AI_KEY
echo ""

# Write AI provider into .env.
{
  echo "LLM_PROVIDER=${AI_PROVIDER}"
  if [[ -n "$AI_KEY" ]]; then
    echo "LLM_API_KEY=${AI_KEY}"
  fi
} >> .env

# ── 5. optional Supabase (canonical memory) ──────────────────────────────────
info "Supabase (optional — leave blank to use the bundled PostgreSQL):"
read -rp "  Supabase URL (blank to skip): " SB_URL
read -rp "  Supabase Publishable key (blank to skip): " SB_PUBLISHABLE
if [[ -n "$SB_URL" && -n "$SB_PUBLISHABLE" ]]; then
  {
    echo "NEXT_PUBLIC_SUPABASE_URL=${SB_URL}"
    echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${SB_PUBLISHABLE}"
  } >> .env
fi

# ── 6. build + start ─────────────────────────────────────────────────────────
info "Building and starting the stack…"
docker compose up -d --build

ok "Fluxentiq is up!"
echo ""
echo "  Web app:   http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost):3000"
echo "  AI bridge: http://localhost:8000/health"
echo "  Database:  localhost:5432 (postgres / fluxentiq)"
echo ""
echo "  Re-configure AI, memory, branding and license at Settings → the in-app UI."
