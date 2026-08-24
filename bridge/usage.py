"""AI usage metering — records token usage and cost to Supabase.

The bridge records each AI call to `ai_usage_logs` (the rich token/cost table)
with prompt/completion tokens and an estimated ``cost_usd``. The legacy
`ai_usage` feature-level table remains the Next.js-side metering surface. When
Supabase is not configured, usage is logged locally.
"""

from __future__ import annotations

import logging
from typing import Any

from .cost import estimate_cost
from .supabase_client import SupabaseClient

logger = logging.getLogger("fluxentiq.bridge.usage")


class UsageRecorder:
    """Records AI usage to `ai_usage_logs` (or logs when unconfigured)."""

    def __init__(self, supabase: SupabaseClient | None) -> None:
        self._supabase = supabase

    async def record(
        self,
        *,
        feature: str,
        model: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        organization_id: str | None = None,
        **_: Any,
    ) -> None:
        cost_usd = estimate_cost(model, prompt_tokens, completion_tokens)

        if self._supabase and organization_id:
            try:
                await self._supabase.insert(
                    "ai_usage_logs",
                    [{
                        "organization_id": organization_id,
                        "model": model,
                        "feature": feature,
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "cost_usd": cost_usd,
                    }],
                )
                return
            except Exception as exc:  # noqa: BLE001 — metering is best-effort
                logger.warning("usage record failed: %s", exc)
                return

        logger.info(
            "usage feature=%s model=%s prompt=%s completion=%s cost=%.8f",
            feature, model, prompt_tokens, completion_tokens, cost_usd,
        )


def make_recorder(supabase: SupabaseClient | None) -> UsageRecorder:
    return UsageRecorder(supabase)
