#!/usr/bin/env python3
"""
Generate reranker training dataset from live company search reports.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(BACKEND_ROOT))

from evals.company_info_search.reranker_tuning import (
    build_dataset_rows_from_report,
    split_rows_by_company,
    write_splits_jsonl,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate reranker dataset from report JSON files.")
    parser.add_argument(
        "--reports",
        nargs="+",
        required=True,
        help="One or more live_company_info_search_*.json files",
    )
    parser.add_argument("--mode", default="hybrid", choices=["hybrid", "legacy"])
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument(
        "--output-dir",
        default=str(BACKEND_ROOT / "evals" / "company_info_search" / "output" / "reranker_dataset"),
        help="Output directory for train/valid/test jsonl",
    )
    args = parser.parse_args()

    rows = []
    for report in args.reports:
        rows.extend(
            build_dataset_rows_from_report(
                Path(report),
                mode=args.mode,
                top_k=max(1, args.top_k),
            )
        )

    splits = split_rows_by_company(rows)
    out_paths = write_splits_jsonl(splits, Path(args.output_dir))

    print(f"dataset_rows={len(rows)}")
    for split_name, items in splits.items():
        print(f"{split_name}={len(items)} file={out_paths[split_name]}")


if __name__ == "__main__":
    main()
