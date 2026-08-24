"""Shared JSON parsing helpers for LLM outputs.

These are provider-agnostic: every provider's JSON-mode (or prompted-JSON)
output is normalized through the same tolerant extractors, so the high-level
AI handlers never care which vendor produced the text.
"""

from __future__ import annotations

import json
from typing import Any

_JSON_BLOCK_MARKER = "[[JSON]]"


class ParseError(RuntimeError):
    """Raised when a model's JSON payload cannot be parsed."""


def strip_json_block(text: str) -> str:
    """Removes a trailing JSON block (``[[JSON]]…`` or bare ``{…}``) from prose."""
    marker = text.find(_JSON_BLOCK_MARKER)
    if marker != -1:
        return text[:marker].strip()
    start = text.rfind("{")
    if start != -1 and extract_last_json_object(text) is not None:
        return text[:start].strip()
    return text.strip()


def extract_trailing_json(text: str) -> dict[str, Any] | None:
    """Parses a trailing JSON block (marked or bare) if present."""
    marker = text.find(_JSON_BLOCK_MARKER)
    if marker != -1:
        return extract_json_object(text[marker + len(_JSON_BLOCK_MARKER):])
    return extract_last_json_object(text)


def extract_last_json_object(text: str) -> dict[str, Any] | None:
    """Parses the last balanced JSON object in ``text`` (None if absent)."""
    start = text.rfind("{")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escape = False
    end = -1
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index
                break
    if end == -1:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def extract_json_object(text: str) -> dict[str, Any]:
    """Tolerantly extracts the first balanced JSON object from ``text``."""
    start = text.find("{")
    if start == -1:
        raise ParseError("Model did not return a JSON object.")
    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(text[start : index + 1])
                except json.JSONDecodeError as exc:
                    raise ParseError(f"Model returned malformed JSON: {exc}") from exc
                if isinstance(parsed, dict):
                    return parsed
                raise ParseError("Model returned JSON that is not an object.")
    raise ParseError("Model returned an unterminated JSON object.")
