from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class SentimentResult:
    label: str
    score: float
    evidence: list[str]
    disclaimer: str


_POSITIVE = {"achieved", "collaborative", "excellent", "growth", "improved", "leadership", "reliable", "strong", "successful", "supportive"}
_NEGATIVE = {"blocked", "concern", "delay", "difficult", "frustrated", "missed", "risk", "struggle", "unclear", "workload"}


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z']+", text.lower())


def analyze_sentiment(texts: Iterable[str]) -> SentimentResult:
    """Return an evidence-bound writing-tone signal, never a people decision."""
    joined = " ".join(value.strip() for value in texts if isinstance(value, str) and value.strip())
    tokens = _tokens(joined)
    if not tokens:
        return SentimentResult(label="insufficient_evidence", score=0.0, evidence=[], disclaimer="No text evidence was supplied. This is not a performance or behavioral assessment.")
    positive = [token for token in tokens if token in _POSITIVE]
    negative = [token for token in tokens if token in _NEGATIVE]
    raw = (len(positive) - len(negative)) / max(len(tokens), 1)
    score = round(max(-1.0, min(1.0, raw * 8)), 3)
    label = "constructive" if score > 0.08 else "concern_language_present" if score < -0.08 else "neutral"
    evidence = sorted(set(positive + negative))[:12]
    return SentimentResult(label=label, score=score, evidence=evidence, disclaimer="Writing-tone output is assistive only. Do not use it to infer personality, protected traits, health, or employment outcomes.")
