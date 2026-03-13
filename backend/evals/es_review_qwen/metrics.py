"""Offline metrics for the Qwen ES review beta."""

from __future__ import annotations

from collections import Counter
from typing import Iterable, Mapping, Any


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "pass", "passed", "win", "tie"}
    return False


def _rate(rows: list[Mapping[str, Any]], key: str) -> float:
    if not rows:
        return 0.0
    return sum(1 for row in rows if _as_bool(row.get(key))) / len(rows)


def summarize_es_review_qwen_metrics(
    rows: Iterable[Mapping[str, Any]],
) -> dict[str, Any]:
    """Aggregate the core acceptance metrics for the Qwen ES review beta."""
    items = list(rows)
    failure_counts = Counter(
        str(row.get("failure_reason") or "").strip()
        for row in items
        if str(row.get("failure_reason") or "").strip()
    )

    return {
        "sample_count": len(items),
        "json_valid_rate": _rate(items, "json_valid"),
        "rewrite_validator_success_rate": _rate(items, "rewrite_validator_pass"),
        "char_limit_pass_rate": _rate(items, "char_limit_pass"),
        "reference_overlap_violation_rate": _rate(items, "reference_overlap_violation"),
        "teacher_tie_or_better_rate": _rate(items, "teacher_tie_or_better"),
        "failure_breakdown": dict(sorted(failure_counts.items())),
    }
