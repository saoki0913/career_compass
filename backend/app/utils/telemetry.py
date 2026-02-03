"""
Lightweight telemetry utilities for ES review and RAG.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Optional

_counters = Counter()
_score_hist = defaultdict(Counter)
_parse_failures = Counter()


def record_es_scores(scores: dict) -> None:
    if not scores:
        return
    _counters["es_review_total"] += 1
    for key, value in scores.items():
        if value is None:
            continue
        try:
            score = int(value)
        except Exception:
            continue
        _score_hist[key][score] += 1


def record_parse_failure(context: str, reason: Optional[str] = None) -> None:
    _counters["parse_failure_total"] += 1
    key = context or "unknown"
    if reason:
        truncated = reason[:120]
        _parse_failures[f"{key}:{truncated}"] += 1
    else:
        _parse_failures[key] += 1


def record_rag_context(
    company_id: Optional[str], context_length: int, source_count: int
) -> None:
    _counters["rag_context_total"] += 1
    if context_length <= 0:
        _counters["rag_context_empty"] += 1
    if source_count <= 0:
        _counters["rag_sources_empty"] += 1


def snapshot() -> dict[str, Any]:
    return {
        "counters": dict(_counters),
        "score_hist": {k: dict(v) for k, v in _score_hist.items()},
        "parse_failures": dict(_parse_failures),
    }
