"""Fluxentiq bridge — structured JSON logging.

Installs a single-line JSON formatter across all loggers so every record is
machine-parseable (for log aggregators / monitoring). Falls back to the stdlib
formatter when an incompatible handler is already attached (idempotent — safe
to call multiple times across module imports).
"""

from __future__ import annotations

import json
import logging
import sys
import time


class JsonFormatter(logging.Formatter):
    """Emits one JSON object per log record."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.time(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            payload["exc"] = self.formatException(record.exc_info)
        # Attach any extra structured fields passed via `extra={...}`.
        for key in ("job_id", "kind", "path", "organization_id"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, default=str)


def setup_json_logging(level: int = logging.INFO) -> None:
    """(Re)configures the root logger to emit JSON to stdout."""
    root = logging.getLogger()
    # Replace any non-JSON stream handler with a JSON one.
    for handler in list(root.handlers):
        root.removeHandler(handler)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(level)
