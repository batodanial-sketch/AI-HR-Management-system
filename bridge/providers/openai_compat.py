"""OpenAI-compatible provider.

Covers four vendor classes with a single implementation, since they all speak
the OpenAI ``/chat/completions`` protocol:

  * OpenAI          — https://api.openai.com/v1
  * Groq            — https://api.groq.com/openai/v1
  * Google Gemini   — https://generativelanguage.googleapis.com/v1beta/openai
  * Custom endpoint — any user-supplied base URL (self-hosted vLLM, LM Studio,
                      Azure-OpenAI-compatible gateways, proxies, …)
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator

import httpx

from ..parsing import extract_json_object
from .base import LLMProvider, ProviderError

logger = logging.getLogger("fluxentiq.bridge.providers.openai_compat")

DEFAULT_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
}


class OpenAICompatibleProvider(LLMProvider):
    """Chat-completions transport for any OpenAI-compatible vendor."""

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        base_url: str = "",
        provider: str = "custom",
        timeout: float = 90.0,
    ) -> None:
        super().__init__(model)
        if not api_key:
            raise ProviderError("LLM_API_KEY is not configured.")
        self._api_key = api_key
        base = (base_url or DEFAULT_BASE_URLS.get(provider, "")).rstrip("/")
        if not base:
            raise ProviderError(
                f"No base URL for provider '{provider}'. Set LLM_BASE_URL."
            )
        self._base = base
        self._provider = provider
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=15.0),
        )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.3,
    ) -> AsyncIterator[str]:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": temperature,
            # Request token usage in the final streamed chunk.
            "stream_options": {"include_usage": True},
        }
        try:
            async with self._client.stream(
                "POST",
                f"{self._base}/chat/completions",
                headers=self._headers(),
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    # The final chunk carries `usage` when stream_options
                    # includes include_usage.
                    usage = chunk.get("usage")
                    if isinstance(usage, dict):
                        self._record_usage(
                            int(usage.get("prompt_tokens", 0) or 0),
                            int(usage.get("completion_tokens", 0) or 0),
                        )
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content")
                    if content:
                        yield content
        except httpx.HTTPStatusError as exc:
            raise ProviderError(
                f"{self._provider} returned {exc.response.status_code}: "
                f"{exc.response.text[:400]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"{self._provider} request failed: {exc}") from exc

    async def complete_json(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
    ) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        try:
            response = await self._client.post(
                f"{self._base}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            if response.status_code == 400 and "response_format" in payload:
                # Some custom endpoints reject response_format — retry without.
                payload.pop("response_format", None)
                response = await self._client.post(
                    f"{self._base}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ProviderError(
                f"{self._provider} returned {exc.response.status_code}: "
                f"{exc.response.text[:400]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"{self._provider} request failed: {exc}") from exc

        body = response.json()
        usage = body.get("usage")
        if isinstance(usage, dict):
            self._record_usage(
                int(usage.get("prompt_tokens", 0) or 0),
                int(usage.get("completion_tokens", 0) or 0),
            )
        content = (body.get("choices") or [{}])[0].get("message", {}).get(
            "content", ""
        )
        return extract_json_object(content)

    async def aclose(self) -> None:
        await self._client.aclose()
