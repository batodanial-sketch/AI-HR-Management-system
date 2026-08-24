"""Backward-compatibility shim.

The AI client is now provider-agnostic and lives in ``bridge.ai_client``
(``AiClient``) with the pluggable transports in ``bridge.providers``. This
module re-exports the historical names so existing imports keep working:

    from bridge.groq_client import GroqClient, GroqError
"""

from .ai_client import AiClient, GroqError

# Historical alias: GroqClient was the original Groq-only client.
GroqClient = AiClient

__all__ = ["AiClient", "GroqClient", "GroqError"]
