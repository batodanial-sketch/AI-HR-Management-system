"""Anthropic (Claude) provider.

Uses the native Messages API (``/v1/messages``) rather than Anthropic's OpenAI
compatibility layer, so Claude's system prompt, streaming, and content-delta
events are handled first-class.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator

import httpx

from ..parsing import extract_json_object
from .base import LLMProvider, ProviderError

logger = logging.getLogger("fluxentiq.bridge.providers.anthropic")

API_BASE = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider(LLMProvider):
    """Claude transport via the Anthropic Messages API."""

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        base_url: str = "",
        timeout: float = 90.0,
    ) -> None:
        super().__init__(model)
        if not api_key:
            raise ProviderError("LLM_API_KEY is not configured.")
        self._api_key = api_key
        self._base = (base_url or API_BASE).rstrip("/")
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=15.0),
        )

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self._api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "Content-Type": "application/json",
        }

    def _split(self, messages: list[dict[str, str]]) -> tuple[str, list[dict[str, str]]]:
        """Splits a leading system message from the conversation."""
        system = ""
        rest: list[dict[str, str]] = []
        for message in messages:
            if message.get("role") == "system" and not rest:
                system = message.get("content", "")
            else:
                rest.append(
                    {"role": message.get("role"), "content": message.get("content", "")}
                )
        return system, rest

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.3,
    ) -> AsyncIterator[str]:
        system, rest = self._split(messages)
        payload: dict = {
            "model": self.model,
            "max_tokens": 1024,
            "messages": rest,
            "stream": True,
            "temperature": temperature,
        }
        if system:
            payload["system"] = system
        try:
            async with self._client.stream(
                "POST",
                f"{self._base}/messages",
                headers=self._headers(),
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]" or not data:
                        continue
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            text = delta.get("text")
                            if text:
                                yield text
                    elif event.get("type") == "message_delta":
                        usage = event.get("usage") or {}
                        if isinstance(usage, dict):
                            self._record_usage(
                                int(usage.get("input_tokens", 0) or 0),
                                int(usage.get("output_tokens", 0) or 0),
                            )
        except httpx.HTTPStatusError as exc:
            raise ProviderError(
                f"anthropic returned {exc.response.status_code}: "
                f"{exc.response.text[:400]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"anthropic request failed: {exc}") from exc

    async def complete_json(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
    ) -> dict:
        system, rest = self._split(messages)
        payload: dict = {
            "model": self.model,
            "max_tokens": 2048,
            "messages": rest,
            "temperature": temperature,
        }
        if system:
            payload["system"] = system
        try:
            response = await self._client.post(
                f"{self._base}/messages",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ProviderError(
                f"anthropic returned {exc.response.status_code}: "
                f"{exc.response.text[:400]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"anthropic request failed: {exc}") from exc

        body = response.json()
        usage = body.get("usage") or {}
        if isinstance(usage, dict):
            self._record_usage(
                int(usage.get("input_tokens", 0) or 0),
                int(usage.get("output_tokens", 0) or 0),
            )
        blocks = body.get("content") or []
        text = "".join(
            block.get("text", "") for block in blocks if block.get("type") == "text"
        )
        return extract_json_object(text)

    async def aclose(self) -> None:
        await self._client.aclose()
