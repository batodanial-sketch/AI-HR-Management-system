"""Fluxentiq bridge — network resilience helpers.

Exponential-backoff retry with full jitter, a rotating user-agent pool, and
payload sanitization so malformed remote responses (broken HTML, unexpected
shapes from n8n webhooks) never crash a pipeline.

`retry_async` is a generic async retry helper; `USER_AGENTS` / `rotate_user_agent`
support scraper UA rotation; `sanitize_dict` guards against non-JSON-safe or
malformed dict values before they are persisted or forwarded.
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from typing import Any, Awaitable, Callable

# Rotating User-Agent pool (desktop browser + our own client). Kept current and
# generic so scrapers look like ordinary clients without pretending to be any
# specific user.
USER_AGENTS: list[str] = [
    "FluxentiqPythonEngine/1.0 (+self-hosted HR platform)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]

_MAX_JITTER = 1.0


def rotate_user_agent(index: int) -> str:
    """Picks a User-Agent deterministically from the pool (no shared state)."""
    return USER_AGENTS[index % len(USER_AGENTS)]


async def retry_async(
    fn: Callable[[], Awaitable[Any]],
    *,
    attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 8.0,
    on_retry: Callable[[int, Exception], None] | None = None,
) -> Any:
    """Runs ``fn`` with exponential backoff + full jitter.

    Full jitter (``random.uniform(0, delay)``) avoids the thundering-herd
    problem of synchronized retries across concurrent scrapes. The final
    attempt's exception is re-raised.
    """
    attempt = 0
    while True:
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001 — retry surface is broad by design
            attempt += 1
            if attempt >= attempts:
                raise
            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            jittered = random.uniform(0, delay)
            if on_retry is not None:
                on_retry(attempt, exc)
            await asyncio.sleep(jittered)


def sanitize_json_payload(value: Any) -> Any:
    """Ensures a value is JSON-serializable, degrading gracefully otherwise.

    Malformed/internally-referential objects (common in scraped DOM-derived
    dicts and n8n webhook payloads) are replaced with a safe string form rather
    than raising, so downstream persistence never crashes on bad input.
    """
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        try:
            return json.loads(json.dumps(value, default=str))
        except (TypeError, ValueError):
            return str(value)
