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

# ---------------------------------------------------------------------------
# Groq model catalog & validation
# ---------------------------------------------------------------------------

# Model ids Groq's OpenAI-compatible API accepts (kept in sync with the
# client-side mirror in `lib/ai-providers.ts`).
GROQ_MODELS: tuple[str, ...] = (
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama-3.2-3b-preview",
    "llama-3.2-11b-vision-preview",
    "mixtral-8x7b-32768",
    "deepseek-r1-distill-llama-70b",
    "qwen-2.5-32b",
    "gemma2-9b-it",
    "openai/gpt-oss-120b",
)

# Human-friendly aliases → canonical Groq model ids.
MODEL_ALIASES: dict[str, str] = {
    "mixtral-8x7b-instruct": "mixtral-8x7b-32768",
    "mixtral": "mixtral-8x7b-32768",
    "llama-3.3-70b": "llama-3.3-70b-versatile",
    "deepseek-r1": "deepseek-r1-distill-llama-70b",
    "deepseek-r1-70b": "deepseek-r1-distill-llama-70b",
    "gpt-oss-120b": "openai/gpt-oss-120b",
}

_GROQ_MODEL_SET = frozenset(GROQ_MODELS)


def normalize_groq_model(model: str) -> str:
    """Alias-resolves and case-folds a Groq model name.

    Returns the canonical model id when valid, otherwise an empty string.
    """
    if not model:
        return ""
    key = model.strip().lower()
    key = MODEL_ALIASES.get(key, key)
    return key if key in _GROQ_MODEL_SET else ""


def resolve_model(provider: str, explicit_model: str | None = None) -> str:
    """Returns the model to use for a provider.

    ``explicit_model`` (from an API test-connection request) is validated
    strictly — unknown Groq models raise ``ProviderError`` so the caller can
    surface the 400 and the valid-model catalog. Runtime configuration
    (``LLM_MODEL`` / ``GROQ_MODEL``) degrades gracefully: unknown Groq models
    fall back to the provider default with a warning, so deployments never
    hard-fail on a stale env var.
    """
    if explicit_model:
        if provider == "groq":
            canonical = normalize_groq_model(explicit_model)
            if not canonical:
                raise ProviderError(
                    f"Unknown Groq model '{explicit_model}'. "
                    f"Valid models: {', '.join(GROQ_MODELS)}."
                )
            return canonical
        return explicit_model.strip()

    configured = settings.llm_model
    if configured:
        if provider == "groq":
            canonical = normalize_groq_model(configured)
            if canonical:
                return canonical
            logger.warning(
                "Unknown Groq model '%s' — falling back to %s.",
                configured,
                DEFAULT_MODELS["groq"],
            )
            return DEFAULT_MODELS["groq"]
        return configured

    # Backward compat: existing Groq deployments set GROQ_MODEL.
    if provider == "groq" and settings.groq_model:
        return normalize_groq_model(settings.groq_model) or DEFAULT_MODELS["groq"]

    return DEFAULT_MODELS.get(provider, "default")


def make_provider(
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> LLMProvider:
    """Builds the provider instance.

    All arguments are optional overrides for the stored/configured values,
    used by the ``/api/ai/test`` diagnostic endpoint. API keys are always
    resolved from the bridge's own configuration (env or settings file) —
    never accepted from request bodies.
    """
    provider_name = (provider or settings.llm_provider).strip().lower() or "groq"
    api_key = settings.llm_api_key
    resolved_model = resolve_model(provider_name, model)
    resolved_base_url = settings.llm_base_url if base_url is None else base_url

    if provider_name in _OPENAI_COMPAT:
        return OpenAICompatibleProvider(
            api_key,
            resolved_model,
            base_url=resolved_base_url,
            provider=provider_name,
        )

    if provider_name == "anthropic":
        return AnthropicProvider(
            api_key,
            resolved_model,
            base_url=resolved_base_url,
        )

    raise ProviderError(
        f"Unsupported LLM_PROVIDER '{provider_name}'. "
        "Use one of: openai, groq, gemini, anthropic, custom."
    )


__all__ = [
    "DEFAULT_MODELS",
    "GROQ_MODELS",
    "MODEL_ALIASES",
    "LLMProvider",
    "ProviderError",
    "make_provider",
    "normalize_groq_model",
    "resolve_model",
]
