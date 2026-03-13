#!/usr/bin/env python3
"""Evaluate Qwen ES review holdout predictions with the current validators."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from evals.es_review_qwen.metrics import summarize_es_review_qwen_metrics  # noqa: E402
from app.routers.es_review import _parse_issues, _validate_rewrite_candidate  # noqa: E402


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "win", "tie"}
    return bool(value)


def _resolve_company_cards(row: dict[str, Any]) -> list[dict[str, Any]]:
    value = row.get("company_evidence_cards")
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Qwen ES review holdout predictions.")
    parser.add_argument("--predictions", required=True, help="Prediction JSONL path")
    parser.add_argument("--output", required=True, help="Summary JSON path")
    args = parser.parse_args()

    rows = _load_jsonl(Path(args.predictions))
    annotated_rows: list[dict[str, Any]] = []

    for row in rows:
        prediction_top3 = row.get("prediction_top3")
        prediction_rewrite = str(row.get("prediction_rewrite") or "")
        company_cards = _resolve_company_cards(row)
        role_name = str(row.get("role_name") or "").strip() or None
        company_name = str(row.get("company_name") or "").strip() or None
        template_type = str(row.get("template_type") or "").strip()
        char_min = int(row["char_min"]) if row.get("char_min") is not None else None
        char_max = int(row["char_max"]) if row.get("char_max") is not None else None
        grounding_mode = str(row.get("grounding_mode") or ("company_general" if company_cards else "none"))

        parsed_issues = _parse_issues(
            prediction_top3 if isinstance(prediction_top3, list) else [],
            3,
            role_name=role_name,
            company_rag_available=bool(company_cards),
        )
        validated_candidate, retry_code, retry_reason, _retry_meta = _validate_rewrite_candidate(
            prediction_rewrite,
            template_type=template_type,
            question=str(row.get("question") or ""),
            company_name=company_name,
            char_min=char_min,
            char_max=char_max,
            issues=parsed_issues,
            role_name=role_name,
            grounding_mode=grounding_mode,
            company_evidence_cards=company_cards,
            review_variant="qwen3-beta",
        )

        json_valid = isinstance(prediction_top3, list) and len(parsed_issues) > 0
        rewrite_validator_pass = validated_candidate is not None
        char_limit_pass = rewrite_validator_pass
        reference_overlap_violation = retry_code == "overlap"
        teacher_tie_or_better = str(row.get("pairwise_preference") or "").strip().lower() in {"win", "tie"}
        if not teacher_tie_or_better:
            teacher_tie_or_better = _to_bool(row.get("teacher_tie_or_better"))

        annotated_rows.append(
            {
                **row,
                "json_valid": json_valid,
                "rewrite_validator_pass": rewrite_validator_pass,
                "char_limit_pass": char_limit_pass,
                "reference_overlap_violation": reference_overlap_violation,
                "teacher_tie_or_better": teacher_tie_or_better,
                "failure_reason": None if rewrite_validator_pass else (retry_code or retry_reason or "validation_failed"),
            }
        )

    summary = summarize_es_review_qwen_metrics(annotated_rows)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_jsonl(output_path.with_name(f"{output_path.stem}_annotated.jsonl"), annotated_rows)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
