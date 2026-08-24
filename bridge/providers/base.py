"""Provider abstraction — the pluggable LLM transport layer.

Every AI provider (OpenAI, Anthropic/Claude, Google Gemini, Groq, or a custom
OpenAI-compatible endpoint) implements :class:`LLMProvider`. The high-level
handlers in ``ai_client.py`` only ever call ``stream_chat`` and
``complete_json``, so adding or swapping a vendor never touches business logic.

This is what makes Fluxentiq "bring any key": a buyer can point the bridge at
whichever vendor (or self-hosted endpoint) their enterprise already uses.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator


class ProviderError(RuntimeError):
    """Raised when a provider is misconfigured or its API call fails."""


class LLMProvider(ABC):
    """Async transport for a specific LLM vendor."""

    def __init__(self, model: str) -> None:
        self.model = model
        self._usage: tuple[int, int] = (0, 0)

    @property
    def name(self) -> str:
        return self.__class__.__name__

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.3,
    ) -> AsyncIterator[str]:
        """Yields content deltas from a streaming chat completion."""

    @abstractmethod
    async def complete_json(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
    ) -> dict:
        """Returns a parsed JSON object (using native JSON mode when available)."""

    # ── Usage capture ──────────────────────────────────────────────────────

    def _record_usage(self, prompt_tokens: int, completion_tokens: int) -> None:
        """Stores the latest provider-reported token counts."""
        self._usage = (prompt_tokens, completion_tokens)

    def last_usage(self) -> tuple[int, int]:
        """Returns ``(prompt_tokens, completion_tokens)`` from the last call."""
        return self._usage
