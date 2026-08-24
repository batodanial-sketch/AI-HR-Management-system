"""Environment configuration for the Fluxentiq AI bridge.

Loads `.env.local` (project convention) and falls back to `.env` so the bridge
can be started from anywhere in the repo. All values are read once at import
time via the module-level `settings` singleton.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

# Load `.env.local` first (highest priority), then `.env`.
_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env.local", override=True)
load_dotenv(_ROOT / ".env", override=False)

# Runtime UI settings (data/settings.json) — written by the Settings page.
# These override the environment for the LLM provider block, so a buyer can
# configure "bring any key" from the web UI without editing env files.
_SETTINGS_FILE = _ROOT / "data" / "settings.json"


def _ui_settings() -> dict:
    try:
        raw = json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            return raw
    except (OSError, json.JSONDecodeError):
        return {}
    return {}


def _ui_ai() -> dict:
    ai = _ui_settings().get("ai")
    return ai if isinstance(ai, dict) else {}


_DEFAULT_MODEL = "openai/gpt-oss-120b"
_DEFAULT_PORT = 8000


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class Settings:
    """Immutable-ish settings object shared across the bridge."""

    @property
    def groq_api_key(self) -> str:
        return os.getenv("GROQ_API_KEY", "").strip()

    @property
    def groq_model(self) -> str:
        return os.getenv("GROQ_MODEL", _DEFAULT_MODEL).strip() or _DEFAULT_MODEL

    # -- Multi-provider LLM configuration (Phase 3: "bring any key") ----------

    @property
    def llm_provider(self) -> str:
        ui = _ui_ai().get("provider")
        if ui and str(ui).strip():
            return str(ui).strip().lower()
        return os.getenv("LLM_PROVIDER", "groq").strip().lower() or "groq"

    @property
    def llm_api_key(self) -> str:
        ui = _ui_ai().get("apiKey")
        if ui and str(ui).strip():
            return str(ui).strip()
        # LLM_API_KEY takes precedence; GROQ_API_KEY is the backward-compatible
        # fallback so existing deployments keep working unchanged.
        return (os.getenv("LLM_API_KEY", "").strip() or self.groq_api_key)

    @property
    def llm_base_url(self) -> str:
        ui = _ui_ai().get("baseUrl")
        if ui and str(ui).strip():
            return str(ui).strip()
        return os.getenv("LLM_BASE_URL", "").strip()

    @property
    def llm_model(self) -> str:
        ui = _ui_ai().get("model")
        if ui and str(ui).strip():
            return str(ui).strip()
        # Only the explicit LLM_MODEL override. Provider-specific defaults live
        # in resolve_model() so each vendor gets a sensible model when unset.
        return os.getenv("LLM_MODEL", "").strip()

    @property
    def supabase_url(self) -> str:
        return (
            os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
            or os.getenv("SUPABASE_URL", "").strip()
        )

    @property
    def supabase_service_role_key(self) -> str:
        # New Secret key first; legacy service-role key as fallback.
        return (
            os.getenv("SUPABASE_SECRET_KEY", "").strip()
            or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        )

    @property
    def bridge_port(self) -> int:
        return _int_env("AI_BRIDGE_PORT", _DEFAULT_PORT)

    @property
    def bridge_secret_key(self) -> str:
        """Shared secret authenticating Next.js → bridge requests."""
        return os.getenv("BRIDGE_SECRET_KEY", "").strip()

    @property
    def rate_limit_per_window(self) -> int:
        """Max AI requests per tenant/IP within the sliding window."""
        return _int_env("AI_RATE_LIMIT_PER_WINDOW", 60)

    @property
    def rate_limit_window_seconds(self) -> float:
        """Sliding-window length in seconds for the AI rate limiter."""
        raw = os.getenv("AI_RATE_LIMIT_WINDOW_SECONDS", "60").strip()
        try:
            value = float(raw)
            return value if value > 0 else 60.0
        except ValueError:
            return 60.0

    @property
    def bridge_secret_configured(self) -> bool:
        return bool(self.bridge_secret_key)

    @property
    def cors_origins(self) -> list[str]:
        raw = os.getenv("AI_BRIDGE_CORS_ORIGINS", "*").strip()
        if raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def groq_configured(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


settings = Settings()
