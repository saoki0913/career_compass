"""RAG golden evaluation regression tests.

Requires local ChromaDB and BM25 data. Skipped in CI where data is absent.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import asdict
from pathlib import Path

import pytest

GOLDEN_PATH = (
    Path(__file__).resolve().parents[2] / "evals" / "rag" / "golden" / "company_info_v1.jsonl"
)
BASELINE_PATH = GOLDEN_PATH.parent / "baseline_v1.json"
BM25_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "bm25"
TENANT_KEY_RE = re.compile(r"^[0-9a-f]{32}$")

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


def _query_id_hash(items: list[dict]) -> str:
    query_ids = [str(item.get("query_id") or "") for item in items]
    encoded = json.dumps(query_ids, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def _metadata_distribution(items: list[dict], key: str) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for item in items:
        metadata = item.get("metadata") or {}
        value = metadata.get(key)
        if isinstance(value, str) and value:
            counts[value] += 1
    return dict(sorted(counts.items()))


def _baseline_config_dict() -> dict:
    from app.rag.hybrid_search import CONTENT_TYPE_BOOSTS
    from evals.rag.evaluate_retrieval import EvalConfig

    data = asdict(
        EvalConfig(top_k=5, content_type_boosts=CONTENT_TYPE_BOOSTS.get("es_review"))
    )
    data.pop("tenant_key", None)
    data.pop("limit", None)
    if data.get("content_type_boosts") is not None:
        data["content_type_boosts"] = dict(sorted(data["content_type_boosts"].items()))
    return dict(sorted(data.items()))


def _config_hash(config_data: dict) -> str:
    encoded = json.dumps(
        config_data,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _assert_baseline_integrity(items: list[dict], baseline: dict) -> None:
    metadata = baseline.get("metadata") or {}
    expected_config = _baseline_config_dict()

    assert baseline.get("n_items") == len(items), (
        f"Baseline n_items {baseline.get('n_items')} does not match golden set size {len(items)}"
    )
    assert metadata.get("golden_sha256") == hashlib.sha256(
        GOLDEN_PATH.read_bytes()
    ).hexdigest()
    assert metadata.get("query_id_hash") == _query_id_hash(items)
    assert metadata.get("tenant_key_distribution") == dict(
        sorted(Counter(item.get("tenant_key") for item in items).items())
    )
    assert metadata.get("target_content_type_distribution") == _metadata_distribution(
        items, "target_content_type"
    )
    assert metadata.get("top_k") == 5
    assert metadata.get("embedding_provider") == "openai"
    assert isinstance(metadata.get("embedding_model"), str) and metadata["embedding_model"]
    assert metadata.get("config") == expected_config
    assert metadata.get("config_hash") == _config_hash(expected_config)


def _has_tenant_aware_bm25_data() -> bool:
    return BM25_DATA_DIR.exists() and any(
        "__" in path.stem for path in BM25_DATA_DIR.glob("*.json")
    )


@_skip_no_data
@pytest.mark.golden_eval
def test_baseline_integrity_matches_golden_set():
    items = _load_golden_items()
    baseline = _load_baseline()

    assert baseline is not None, f"Baseline JSON not found: {BASELINE_PATH}"
    _assert_baseline_integrity(items, baseline)

    for metric in ("ndcg_at_k_src", "mrr_src", "hit_rate_src", "precision_src", "recall_src"):
        assert metric in baseline, f"Missing baseline metric: {metric}"
        assert isinstance(
            baseline[metric], (int, float)
        ), f"Baseline metric is not numeric: {metric}"
        assert 0.0 <= float(baseline[metric]) <= 1.0, f"Baseline metric out of range: {metric}"


@_skip_no_data
@pytest.mark.skipif(
    not _has_tenant_aware_bm25_data(),
    reason="Tenant-aware BM25 data not found; regenerate RAG data after strict tenant migration",
)
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
    assert baseline is not None
    _assert_baseline_integrity(items, baseline)
    tolerance = 0.02
    for metric in ("ndcg_at_k_src", "mrr_src", "hit_rate_src"):
        current = getattr(result, metric)
        prev = baseline[metric]
        assert current >= prev - tolerance, (
            f"{metric} regressed: {current:.4f} < {prev:.4f} - {tolerance}"
        )


@_skip_no_data
@pytest.mark.golden_eval
def test_golden_set_integrity():
    items = _load_golden_items()
    assert len(items) >= 50, f"Golden set too small: {len(items)}"

    company_ids = set()
    query_ids = set()
    query_types = set()
    difficulties = set()
    for item in items:
        assert "company_id" in item, "Missing company_id"
        assert TENANT_KEY_RE.fullmatch(item.get("tenant_key", "")), "Missing tenant_key"
        assert item.get("query_id"), "Missing query_id"
        assert item["query_id"] not in query_ids, f"Duplicate query_id: {item['query_id']}"
        assert "query" in item, "Missing query"
        assert item.get("query_type") in {
            "single-hop",
            "multi-hop",
            "reasoning",
            "conversational",
            "fact-lookup",
        }
        assert item.get("difficulty") in {"easy", "medium", "hard"}
        assert "gold_sources" in item, "Missing gold_sources"
        assert len(item["gold_sources"]) > 0, f"Empty gold_sources for {item['query']}"
        metadata = item.get("metadata") or {}
        assert metadata.get("source") in {"auto_bm25", "manual", "synthetic"}
        assert metadata.get("review_status") in {"candidate", "reviewed"}
        query_ids.add(item["query_id"])
        query_types.add(item["query_type"])
        difficulties.add(item["difficulty"])
        company_ids.add(item["company_id"])

    assert len(company_ids) >= 5, f"Too few companies: {len(company_ids)}"
    assert len(query_types) >= 3, f"Too few query types: {query_types}"
    assert len(difficulties) >= 2, f"Too few difficulty levels: {difficulties}"
