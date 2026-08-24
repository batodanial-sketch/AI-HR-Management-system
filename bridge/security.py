"""Fluxentiq bridge — internal service auth.

All functional bridge endpoints (everything under ``/api/*``) are protected by
a shared secret. Requests must present it either as an ``Authorization: Bearer
<secret>`` header or an ``X-Bridge-Secret: <secret>`` header. Comparison is
constant-time (``hmac.compare_digest``) to avoid timing side-channels.

The secret is read from ``BRIDGE_SECRET_KEY`` (see ``bridge/config.py``). When
it is NOT configured, the middleware FAILS CLOSED — every protected request is
rejected with 401 rather than silently allowing unauthenticated access.

Only ``/health`` (and the OpenAPI surface) are exempt, since they expose no
tenant data and must remain reachable by uptime monitors.
"""

from __future__ import annotations

import hmac

from bridge.config import settings

PUBLIC_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


def bridge_secret() -> str:
    """The configured shared secret (empty string when unset)."""
    return settings.bridge_secret_key


def is_public_path(path: str) -> bool:
    """True for liveness/docs routes that do not need the secret."""
    if path in PUBLIC_PATHS:
        return True
    return path.startswith("/openapi")


def verify_bridge_secret(authorization: str | None, x_bridge_secret: str | None) -> bool:
    """Constant-time check of the bearer/header secret.

    Fails closed: a missing or blank configured secret can never validate.
    """
    secret = bridge_secret()
    if not secret:
        return False

    provided = ""
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    elif x_bridge_secret:
        provided = x_bridge_secret.strip()

    if not provided:
        return False
    return hmac.compare_digest(provided, secret)
