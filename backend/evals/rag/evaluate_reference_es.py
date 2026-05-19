#!/usr/bin/env python3
"""Retired reference ES retrieval quality evaluator."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from scripts.ingest_reference_es import load_records


def _recall_at_k(retrieved_ids: list[str], expected_id: str) -> float:
    return 1.0 if expected_id in retrieved_ids else 0.0


def _ndcg_at_k(retrieved_ids: list[str], expected_id: str) -> float:
    for index, es_id in enumerate(retrieved_ids, 1):
        if es_id == expected_id:
            return 1.0 / math.log2(index + 1)
    return 0.0


async def evaluate_reference_es(
    input_path: Path,
    *,
    recall_k: int,
    ndcg_k: int,
    ingest_first: bool,
    ingest_session_id: str,
) -> dict[str, Any]:
    load_records(
        input_path,
        default_source_version="v1",
        ingest_session_id=ingest_session_id,
    )
    raise RuntimeError("reference ES semantic evaluation has been removed from runtime")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate reference ES retrieval")
    parser.add_argument("--input", required=True, help="Reference ES JSONL path")
    parser.add_argument("--output", help="Optional JSON output path")
    parser.add_argument("--top-k", type=int, help="Deprecated alias for --recall-k and --ndcg-k")
    parser.add_argument("--recall-k", type=int, default=10)
    parser.add_argument("--ndcg-k", type=int, default=5)
    parser.add_argument("--ingest", action="store_true", help="Ingest records before evaluation")
    parser.add_argument("--ingest-session-id", default="reference-es-eval")
    parser.add_argument("--min-recall", type=float, default=0.85)
    parser.add_argument("--min-ndcg", type=float, default=0.75)
    return parser.parse_args()


async def main_async(args: argparse.Namespace) -> int:
    result = await evaluate_reference_es(
        Path(args.input),
        recall_k=args.top_k or args.recall_k,
        ndcg_k=args.ndcg_k,
        ingest_first=args.ingest,
        ingest_session_id=args.ingest_session_id,
    )
    result["thresholds"] = {
        "recall_at_k_min": args.min_recall,
        "ndcg_at_k_min": args.min_ndcg,
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload, encoding="utf-8")
    print(payload, end="")
    if result["recall_at_k"] < args.min_recall or result["ndcg_at_k"] < args.min_ndcg:
        return 1
    return 0


def main() -> int:
    return asyncio.run(main_async(parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
