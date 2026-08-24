"""Provider factory — resolves an LLM provider from configuration.

Supported ``LLM_PROVIDER`` values:

  * ``groq``     → Groq (OpenAI-compatible)
  * ``openai``   → OpenAI
  * ``gemini``   → Google Gemini (OpenAI-compatible endpoint)
  * ``anthropic``→ Anthropic Claude (native Messages API)
  * ``custom``   → any OpenAI-compatible endpoint via ``LLM_BASE_URL``
"""

from __future__ import annotations

import logging

from ..config import settings
from .anthropic import AnthropicProvider
from .base import LLMProvider, ProviderError
from .openai_compat import OpenAICompatibleProvider

logger = logging.getLogger("fluxentiq.bridge.providers")

# Vendors that use the OpenAI chat-completions protocol.
_OPENAI_COMPAT = {"openai", "groq", "gemini", "custom"}

# Sensible per-vendor default models (used when LLM_MODEL is unset).
DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "groq": "openai/gpt-oss-120b",
    "gemini": "gemini-2.0-flash",
    "anthropic": "claude-3-5-sonnet-latest",
    "custom": "default",
}


def resolve_model(provider: str) -> str:
    """Returns the configured model, falling back to a provider default."""
    configured = settings.llm_model
    if configured:
        return configured
    # Backward compat: existing Groq deployments set GROQ_MODEL.
    if provider == "groq" and settings.groq_model:
        return settings.groq_model
    return DEFAULT_MODELS.get(provider, "default")


def make_provider() -> LLMProvider:
    """Builds the provider instance for the configured vendor."""
    provider = settings.llm_provider
    api_key = settings.llm_api_key
    model = resolve_model(provider)

    if provider in _OPENAI_COMPAT:
        return OpenAICompatibleProvider(
            api_key,
            model,
            base_url=settings.llm_base_url,
            provider=provider,
        )

    if provider == "anthropic":
        return AnthropicProvider(api_key, model, base_url=settings.llm_base_url)

    raise ProviderError(
        f"Unsupported LLM_PROVIDER '{provider}'. "
        "Use one of: openai, groq, gemini, anthropic, custom."
    )


__all__ = ["LLMProvider", "ProviderError", "make_provider", "resolve_model"]
