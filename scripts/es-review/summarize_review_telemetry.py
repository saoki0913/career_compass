#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def _extract_review_meta(record: Any) -> dict[str, Any] | None:
    if not isinstance(record, dict):
        return None
    review_meta = record.get("review_meta")
    if isinstance(review_meta, dict):
        return review_meta
    result = record.get("result")
    if isinstance(result, dict) and isinstance(result.get("review_meta"), dict):
        return result["review_meta"]
    return None


def load_review_meta_records(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []

    payload = json.loads(text)
    if isinstance(payload, list):
        records = payload
    else:
        records = [payload]

    metas: list[dict[str, Any]] = []
    for record in records:
        review_meta = _extract_review_meta(record)
        if review_meta:
            metas.append(review_meta)
    return metas


def summarize_review_meta_records(records: list[dict[str, Any]]) -> dict[str, Any]:
    retry_distribution: Counter[int] = Counter()
    length_fix_results: Counter[str] = Counter()
    provider_counts: Counter[str] = Counter()
    model_counts: Counter[str] = Counter()
    length_profile_counts: Counter[str] = Counter()
    length_failure_code_counts: Counter[str] = Counter()
    quality_signal_counts: Counter[str] = Counter()
    token_totals = defaultdict(int)

    for meta in records:
        retry_distribution[int(meta.get("rewrite_attempt_count") or 0)] += 1
        length_fix_results[str(meta.get("length_fix_result") or "not_needed")] += 1
        provider_counts[str(meta.get("llm_provider") or "unknown")] += 1
        model_counts[str(meta.get("llm_model") or "unknown")] += 1
        if meta.get("length_profile_id"):
            length_profile_counts[str(meta["length_profile_id"])] += 1
        if meta.get("length_failure_code"):
            length_failure_code_counts[str(meta["length_failure_code"])] += 1

        if meta.get("weak_evidence_notice"):
            quality_signal_counts["weak_evidence_notice"] += 1
        if meta.get("length_policy") == "soft_ok":
            quality_signal_counts["soft_ok"] += 1
        if meta.get("length_fix_result") == "soft_recovered" or meta.get("rewrite_validation_status") == "soft_ok":
            quality_signal_counts["soft_recovered"] += 1
        if meta.get("length_fix_attempted"):
            quality_signal_counts["length_fix_attempted"] += 1

        usage = meta.get("token_usage") or {}
        if isinstance(usage, dict):
            for key in (
                "input_tokens",
                "output_tokens",
                "reasoning_tokens",
                "cached_input_tokens",
                "llm_call_count",
                "structured_call_count",
                "text_call_count",
            ):
                token_totals[key] += int(usage.get(key) or 0)

    total = len(records)
    average_rewrite_attempts = (
        sum(attempt * count for attempt, count in retry_distribution.items()) / total
        if total
        else 0.0
    )
    return {
        "total_reviews": total,
        "retry_distribution": {str(k): v for k, v in sorted(retry_distribution.items())},
        "average_rewrite_attempts": round(average_rewrite_attempts, 3),
        "length_fix_results": dict(length_fix_results),
        "providers": dict(provider_counts),
        "models": dict(model_counts),
        "length_profiles": dict(length_profile_counts),
        "length_failure_codes": dict(length_failure_code_counts),
        "quality_signals": dict(quality_signal_counts),
        "token_usage_totals": dict(token_totals),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: summarize_review_telemetry.py <json-file>", file=sys.stderr)
        return 2

    path = Path(argv[1])
    summary = summarize_review_meta_records(load_review_meta_records(path))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
