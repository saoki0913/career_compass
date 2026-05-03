#!/usr/bin/env python3
"""Compare RAG retrieval with Contextual Retrieval disabled and enabled.

This runner intentionally executes ``evaluate_retrieval.py`` in subprocesses so
the settings module sees the intended environment on import.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = ROOT.parent
EVAL_SCRIPT = ROOT / "evals" / "rag" / "evaluate_retrieval.py"


def _collection_distribution(output_jsonl: Path) -> dict[str, int]:
    counts: Counter[str] = Counter()
    if not output_jsonl.exists():
        return {}
    with output_jsonl.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            item = json.loads(line)
            for collection in item.get("dense_retrieved_collections") or []:
                if isinstance(collection, str) and collection:
                    counts[collection] += 1
    return dict(sorted(counts.items()))


def _run_eval(
    *,
    enabled: bool,
    args: argparse.Namespace,
    baseline_path: Path,
    output_jsonl: Path,
) -> dict[str, Any]:
    env = os.environ.copy()
    env["CONTEXTUAL_RETRIEVAL_ENABLED"] = "true" if enabled else "false"
    input_path = Path(args.input).resolve()

    cmd = [
        sys.executable,
        str(EVAL_SCRIPT),
        "--input",
        str(input_path),
        "--top-k",
        str(args.top_k),
        "--save-baseline",
        str(baseline_path),
        "--output",
        str(output_jsonl),
    ]
    if args.tenant_key:
        cmd.extend(["--tenant-key", args.tenant_key])
    if args.limit:
        cmd.extend(["--limit", str(args.limit)])

    completed = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        env=env,
        check=False,
        text=True,
        capture_output=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"contextual={enabled} eval failed with {completed.returncode}\n"
            f"STDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
        )
    result = json.loads(baseline_path.read_text(encoding="utf-8"))
    result["collection_distribution"] = _collection_distribution(output_jsonl)
    return result


def _delta(enabled: dict[str, Any], disabled: dict[str, Any], key: str) -> float:
    return float(enabled.get(key, 0.0)) - float(disabled.get(key, 0.0))


def build_comparison(disabled: dict[str, Any], enabled: dict[str, Any]) -> dict[str, Any]:
    metrics = ("ndcg_at_k_src", "mrr_src", "hit_rate_src", "recall_src")
    return {
        "disabled": {key: disabled.get(key) for key in metrics},
        "enabled": {key: enabled.get(key) for key in metrics},
        "delta": {key: _delta(enabled, disabled, key) for key in metrics},
        "collectionDistribution": {
            "disabled": disabled.get("collection_distribution", {}),
            "enabled": enabled.get("collection_distribution", {}),
        },
        "n_items": enabled.get("n_items", disabled.get("n_items", 0)),
        "decisionThresholds": {
            "ndcg_at_k_src_min_delta": -0.02,
            "mrr_src_min_delta": -0.03,
            "hit_rate_src_min_delta": -0.02,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare contextual retrieval on/off")
    parser.add_argument("--input", required=True, help="Golden JSONL path")
    parser.add_argument("--output", required=True, help="Comparison JSON output path")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--tenant-key")
    parser.add_argument("--limit", type=int, default=0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="rag-contextual-eval-") as tmp:
        tmp_path = Path(tmp)
        disabled = _run_eval(
            enabled=False,
            args=args,
            baseline_path=tmp_path / "disabled.json",
            output_jsonl=tmp_path / "disabled.jsonl",
        )
        enabled = _run_eval(
            enabled=True,
            args=args,
            baseline_path=tmp_path / "enabled.json",
            output_jsonl=tmp_path / "enabled.jsonl",
        )

    comparison = build_comparison(disabled, enabled)
    output_path.write_text(json.dumps(comparison, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(comparison, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
