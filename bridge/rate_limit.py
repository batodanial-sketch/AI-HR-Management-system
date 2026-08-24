"""Fluxentiq bridge — per-tenant sliding-window rate limiting.

An in-memory, thread-safe sliding-window limiter keyed by ``organization_id``
(falling back to the client IP, then a shared anonymous bucket). This is the
same design as the Next.js ``lib/rate-limit.ts`` — no external Redis dependency,
single-process by design. A multi-worker uvicorn deployment would need a shared
store (documented as a known limitation).

A request is allowed when fewer than ``limit`` hits occurred in the trailing
``window`` seconds; otherwise it is rejected with the number of seconds to
retry, which callers surface via HTTP 429 + ``Retry-After``.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Optional


class SlidingWindowRateLimiter:
    """Per-key sliding-window limiter (bounded memory, thread-safe)."""

    def __init__(
        self,
        limit: int = 60,
        window_seconds: float = 60.0,
        max_keys: int = 10_000,
    ) -> None:
        self._limit = max(1, limit)
        self._window = max(1.0, window_seconds)
        self._max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> tuple[bool, float]:
        """Returns ``(allowed, retry_after_seconds)``.

        ``retry_after`` is meaningful only when ``allowed`` is False.
        """
        now = time.monotonic()
        with self._lock:
            window = self._hits.get(key)
            if window is None:
                # Bound the map: evict the oldest key when at capacity.
                if len(self._hits) >= self._max_keys:
                    oldest = next(iter(self._hits), None)
                    if oldest is not None:
                        self._hits.pop(oldest, None)
                window = deque()
                self._hits[key] = window

            # Drop timestamps that have fallen outside the window.
            while window and now - window[0] >= self._window:
                window.popleft()

            if len(window) >= self._limit:
                retry_after = window[0] + self._window - now
                return False, max(0.0, retry_after)

            window.append(now)
            return True, 0.0

    def reset(self) -> None:
        """Clears all tracked windows (used in tests / config reloads)."""
        with self._lock:
            self._hits.clear()


def make_rate_limiter(
    limit: Optional[int] = None,
    window_seconds: Optional[float] = None,
) -> SlidingWindowRateLimiter:
    """Builds a limiter from bridge config (env-driven)."""
    from .config import settings

    return SlidingWindowRateLimiter(
        limit=limit if limit is not None else settings.rate_limit_per_window,
        window_seconds=(
            window_seconds if window_seconds is not None
            else settings.rate_limit_window_seconds
        ),
    )
