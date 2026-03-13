"""
Utilities for job-hunting reranker tuning.

This module focuses on:
1) Building binary training data from live search reports
2) Splitting by company (leakage-safe)
3) Comparing base/tuned report outcomes
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


RECRUIT_KINDS = {"recruitment_main", "recruitment_intern"}


@dataclass
class DatasetRow:
    query: str
    passage: str
    label: int
    company_name: str
    kind: str
    mode: str
    source_report: str
    difficulty: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "passage": self.passage,
            "label": self.label,
            "company_name": self.company_name,
            "kind": self.kind,
            "mode": self.mode,
            "source_report": self.source_report,
            "difficulty": self.difficulty,
        }


def _build_query(run: dict[str, Any]) -> str:
    queries = run.get("queries") or []
    if queries:
        return str(queries[0])
    company = str(run.get("company_name", "") or "").strip()
    kind = str(run.get("kind", "") or "").strip()
    if kind.startswith("content_type:"):
        suffix = kind.split(":", 1)[1]
        return f"{company} {suffix}"
    return f"{company} 採用情報"


def _build_passage(item: dict[str, Any]) -> str:
    title = str(item.get("title", "") or "").strip()
    snippet = str(item.get("snippet", "") or "").strip()
    url = str(item.get("url", "") or "").strip()
    return f"{title}\n{snippet}\n{url}".strip()


def _is_positive(run: dict[str, Any], item: dict[str, Any]) -> bool:
    if not bool(item.get("is_official", False)):
        return False
    if not bool(item.get("company_name_matched", False)):
        return False
    kind = str(run.get("kind", ""))
    if kind in RECRUIT_KINDS and not bool(item.get("year_matched", False)):
        return False
    return True


def _is_hard_negative(run: dict[str, Any], item: dict[str, Any]) -> bool:
    kind = str(run.get("kind", ""))
    if bool(item.get("company_name_matched", False)) is False:
        return True
    if bool(item.get("is_official", False)) is False:
        return True
    if kind in RECRUIT_KINDS and bool(item.get("year_matched", True)) is False:
        return True
    return False


def build_dataset_rows_from_report(
    report_json: Path,
    mode: str = "hybrid",
    top_k: int = 10,
) -> list[DatasetRow]:
    payload = json.loads(report_json.read_text(encoding="utf-8"))
    rows: list[DatasetRow] = []
    source_name = report_json.name

    for run in payload.get("runs", []):
        if run.get("mode") != mode:
            continue
        if run.get("error"):
            continue

        raw_items = run.get("hybrid_raw_top", []) if mode == "hybrid" else run.get("legacy_raw_top", [])
        if not raw_items:
            continue
        raw_items = raw_items[:top_k]

        query = _build_query(run)
        company = str(run.get("company_name", "") or "")
        kind = str(run.get("kind", "") or "")

        positives = [item for item in raw_items if _is_positive(run, item)]
        negatives = [item for item in raw_items if _is_hard_negative(run, item)]

        if positives:
            rows.append(
                DatasetRow(
                    query=query,
                    passage=_build_passage(positives[0]),
                    label=1,
                    company_name=company,
                    kind=kind,
                    mode=mode,
                    source_report=source_name,
                    difficulty="positive",
                )
            )

        for neg in negatives[:3]:
            rows.append(
                DatasetRow(
                    query=query,
                    passage=_build_passage(neg),
                    label=0,
                    company_name=company,
                    kind=kind,
                    mode=mode,
                    source_report=source_name,
                    difficulty="hard_negative",
                )
            )

    return rows


def split_rows_by_company(
    rows: list[DatasetRow],
    train_ratio: float = 0.8,
    valid_ratio: float = 0.1,
) -> dict[str, list[DatasetRow]]:
    train: list[DatasetRow] = []
    valid: list[DatasetRow] = []
    test: list[DatasetRow] = []

    for row in rows:
        key = row.company_name.strip().lower()
        bucket = int(hashlib.md5(key.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
        if bucket < train_ratio:
            train.append(row)
        elif bucket < train_ratio + valid_ratio:
            valid.append(row)
        else:
            test.append(row)

    return {"train": train, "valid": valid, "test": test}


def write_splits_jsonl(splits: dict[str, list[DatasetRow]], output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    out_paths: dict[str, Path] = {}
    for split_name, rows in splits.items():
        path = output_dir / f"{split_name}.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row.to_dict(), ensure_ascii=False) + "\n")
        out_paths[split_name] = path
    return out_paths


def compare_reports(base_report: Path, tuned_report: Path) -> dict[str, Any]:
    base = json.loads(base_report.read_text(encoding="utf-8"))
    tuned = json.loads(tuned_report.read_text(encoding="utf-8"))

    def _safe_rate(payload: dict[str, Any], section: str) -> float:
        return float(payload.get("summary", {}).get(section, {}).get("hybrid", {}).get("rate", 0.0))

    base_codes = dict(base.get("summary", {}).get("failure_analysis", {}).get("top_failure_codes", []))
    tuned_codes = dict(tuned.get("summary", {}).get("failure_analysis", {}).get("top_failure_codes", []))
    tracked_codes = [
        "year_mismatch",
        "url_pattern_mismatch",
        "official_rank_too_low",
        "no_official_in_top_n",
    ]

    return {
        "overall_rate_delta": _safe_rate(tuned, "overall") - _safe_rate(base, "overall"),
        "recruitment_rate_delta": _safe_rate(tuned, "recruitment") - _safe_rate(base, "recruitment"),
        "corporate_rate_delta": _safe_rate(tuned, "corporate") - _safe_rate(base, "corporate"),
        "failure_code_deltas": {
            code: int(tuned_codes.get(code, 0)) - int(base_codes.get(code, 0))
            for code in tracked_codes
        },
    }
