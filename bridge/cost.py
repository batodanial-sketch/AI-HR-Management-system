"""Fluxentiq bridge — token cost estimation (USD per 1M tokens).

Provides a per-model pricing table (input/output dollars per million tokens)
with a safe default for unknown models, so the bridge can attach an estimated
``cost_usd`` to every recorded AI call. Values are best-effort estimates and
can be overridden per-deployment via env (``AI_COST_INPUT_PER_1M`` /
``AI_COST_OUTPUT_PER_1M``) for self-hosted / BYOK endpoints whose pricing is
not in the table.
"""

from __future__ import annotations

import os

# (input, output) USD per 1,000,000 tokens. Keys are matched by exact name or
# case-insensitive prefix so a model variant still gets a sensible estimate.
MODEL_PRICE_PER_1M: dict[str, tuple[float, float]] = {
    # Groq-hosted open-weight GPT-OSS models (prices are estimates; override
    # via AI_COST_INPUT_PER_1M / AI_COST_OUTPUT_PER_1M).
    "openai/gpt-oss-120b": (0.59, 0.99),
    "openai/gpt-oss-20b": (0.09, 0.23),
    # Retired Groq llama models (kept for historical entries).
    "llama-3.3-70b": (0.59, 0.79),
    "llama-3.1-8b": (0.05, 0.08),
    "llama-3.2-": (0.05, 0.08),
    # OpenAI
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "o3-mini": (1.10, 4.40),
    # Anthropic Claude
    "claude-3-5": (3.00, 15.00),
    "claude-3-7": (3.00, 15.00),
    "claude-3": (3.00, 15.00),
    "claude-": (3.00, 15.00),
    # Gemini (OpenAI-compat endpoints)
    "gemini-1.5": (1.25, 5.00),
    "gemini-2.0": (1.25, 5.00),
}

# Fallback when a model is unknown.
DEFAULT_PRICE_PER_1M = (1.00, 3.00)


def _env_price(name: str) -> float | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def price_per_1m(model: str) -> tuple[float, float]:
    """Returns (input, output) USD per 1M tokens for a model."""
    env_in = _env_price("AI_COST_INPUT_PER_1M")
    env_out = _env_price("AI_COST_OUTPUT_PER_1M")
    if env_in is not None and env_out is not None:
        return env_in, env_out

    name = (model or "").lower()
    for prefix, price in MODEL_PRICE_PER_1M.items():
        if name.startswith(prefix):
            return price
    return DEFAULT_PRICE_PER_1M


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimates USD cost for a completion."""
    in_price, out_price = price_per_1m(model)
    return round(
        (prompt_tokens / 1_000_000) * in_price
        + (completion_tokens / 1_000_000) * out_price,
        8,
    )
