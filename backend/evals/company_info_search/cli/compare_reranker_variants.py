#!/usr/bin/env python3
"""
Compare base vs tuned live-search reports.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(BACKEND_ROOT))

from evals.company_info_search.reranker_tuning import compare_reports


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare reranker variant reports.")
    parser.add_argument("--base-report", required=True)
    parser.add_argument("--tuned-report", required=True)
    parser.add_argument("--output-json", default="")
    args = parser.parse_args()

    summary = compare_reports(Path(args.base_report), Path(args.tuned_report))
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if args.output_json:
        out = Path(args.output_json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"saved={out}")


if __name__ == "__main__":
    main()
