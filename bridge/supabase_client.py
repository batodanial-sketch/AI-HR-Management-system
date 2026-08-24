"""Minimal async PostgREST client for the bridge's Supabase integration.

The AI bridge writes to the canonical Supabase PostgreSQL database over the
PostgREST HTTP API using the service-role key (server-side only). Only the
operations the bridge actually needs are exposed — no ORM, no connection pool.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger("fluxentiq.bridge.supabase")


class SupabaseError(RuntimeError):
    """Raised when a PostgREST request fails."""


class SupabaseClient:
    """Async wrapper over the Supabase PostgREST endpoint."""

    def __init__(self, url: str, service_role_key: str, timeout: float = 30.0) -> None:
        if not url or not service_role_key:
            raise SupabaseError(
                "Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)."
            )
        self._base = url.rstrip("/") + "/rest/v1"
        self._key = service_role_key
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10.0),
        )

    @property
    def configured(self) -> bool:
        return bool(self._base and self._key)

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    async def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        params: list[tuple[str, str]] = [("select", columns), ("limit", str(limit))]
        for key, value in (filters or {}).items():
            params.append((key, f"eq.{value}"))

        try:
            response = await self._client.get(
                f"{self._base}/{table}",
                headers=self._headers(),
                params=params,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise SupabaseError(
                f"select {table} failed ({exc.response.status_code}): "
                f"{exc.response.text[:300]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SupabaseError(f"select {table} request failed: {exc}") from exc

        data = response.json()
        return data if isinstance(data, list) else []

    async def insert(self, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        try:
            response = await self._client.post(
                f"{self._base}/{table}",
                headers=self._headers(),
                json=rows,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise SupabaseError(
                f"insert {table} failed ({exc.response.status_code}): "
                f"{exc.response.text[:300]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SupabaseError(f"insert {table} request failed: {exc}") from exc

        data = response.json()
        return data if isinstance(data, list) else []

    async def update(
        self,
        table: str,
        match: dict[str, str],
        patch: dict[str, Any],
    ) -> None:
        params: list[tuple[str, str]] = [
            (key, f"eq.{value}") for key, value in match.items()
        ]
        try:
            response = await self._client.patch(
                f"{self._base}/{table}",
                headers=self._headers(),
                params=params,
                json=patch,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise SupabaseError(
                f"update {table} failed ({exc.response.status_code}): "
                f"{exc.response.text[:300]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SupabaseError(f"update {table} request failed: {exc}") from exc

    async def aclose(self) -> None:
        await self._client.aclose()
