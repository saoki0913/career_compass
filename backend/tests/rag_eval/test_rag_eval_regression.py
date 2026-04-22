"""RAG golden evaluation regression tests.

Requires local ChromaDB and BM25 data. Skipped in CI where data is absent.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

GOLDEN_PATH = Path(__file__).resolve().parents[2] / "evals" / "rag" / "golden" / "company_info_v1.jsonl"
BASELINE_PATH = GOLDEN_PATH.parent / "baseline_v1.json"

_skip_no_data = pytest.mark.skipif(
    not GOLDEN_PATH.exists(),
    reason="Golden JSONL not found (CI or missing data)",
)


def _load_golden_items() -> list[dict]:
    items = []
    with GOLDEN_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


def _load_baseline() -> dict | None:
    if not BASELINE_PATH.exists():
        return None
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))


def _save_baseline(result) -> None:
    data = {
        "ndcg_at_k_src": result.ndcg_at_k_src,
        "mrr_src": result.mrr_src,
        "hit_rate_src": result.hit_rate_src,
        "precision_src": result.precision_src,
        "recall_src": result.recall_src,
        "n_items": result.n_items,
    }
    BASELINE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


@_skip_no_data
@pytest.mark.golden_eval
@pytest.mark.asyncio
async def test_rag_golden_eval_regression():
    from evals.rag.evaluate_retrieval import EvalConfig, run_evaluation

    items = _load_golden_items()
    assert len(items) > 0, "Golden set is empty"

    result = await run_evaluation(items, EvalConfig(top_k=5))

    assert result.n_items == len(items)
    assert result.ndcg_at_k_src >= 0.40, f"nDCG@5(src) {result.ndcg_at_k_src:.4f} < 0.40"
    assert result.mrr_src >= 0.35, f"MRR(src) {result.mrr_src:.4f} < 0.35"
    assert result.hit_rate_src >= 0.45, f"Hit@5(src) {result.hit_rate_src:.4f} < 0.45"

    baseline = _load_baseline()
    if baseline:
        tolerance = 0.02
        for metric in ("ndcg_at_k_src", "mrr_src", "hit_rate_src"):
            current = getattr(result, metric)
            prev = baseline[metric]
            assert current >= prev - tolerance, (
                f"{metric} regressed: {current:.4f} < {prev:.4f} - {tolerance}"
            )

    _save_baseline(result)


@_skip_no_data
@pytest.mark.golden_eval
def test_golden_set_integrity():
    items = _load_golden_items()
    assert len(items) >= 10, f"Golden set too small: {len(items)}"

    company_ids = set()
    for item in items:
        assert "company_id" in item, "Missing company_id"
        assert "query" in item, "Missing query"
        assert "gold_sources" in item, "Missing gold_sources"
        assert len(item["gold_sources"]) > 0, f"Empty gold_sources for {item['query']}"
        company_ids.add(item["company_id"])

    assert len(company_ids) >= 3, f"Too few companies: {len(company_ids)}"
