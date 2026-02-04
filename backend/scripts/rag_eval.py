#!/usr/bin/env python3
"""
Evaluate dense RAG retrieval quality against gold labels or baseline outputs.

Input JSONL format (one per line):
{
  "company_id": "...",
  "query": "...",
  "gold_chunk_ids": ["..."],        # optional
  "gold_sources": ["https://..."],  # optional
  "baseline_topk": [                 # optional
    {"id": "...", "source_url": "..."}
  ]
}
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
import time
from pathlib import Path
from typing import Iterable, Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.utils.hybrid_search import dense_hybrid_search, CONTENT_TYPE_BOOSTS


def _load_jsonl(path: Path) -> list[dict]:
    items = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
    return items


def _normalize_source(url: str) -> str:
    return (url or "").strip().rstrip("/")


def _extract_gold(item: dict) -> tuple[set[str], set[str]]:
    gold_ids = set()
    gold_sources = set()
    for cid in item.get("gold_chunk_ids") or []:
        if isinstance(cid, str) and cid:
            gold_ids.add(cid)
    for url in item.get("gold_sources") or []:
        if isinstance(url, str) and url:
            gold_sources.add(_normalize_source(url))
    return gold_ids, gold_sources


def _extract_retrieved(results: Iterable[dict]) -> tuple[list[str], list[str]]:
    ids: list[str] = []
    sources: list[str] = []
    for item in results:
        doc_id = item.get("id")
        if isinstance(doc_id, str) and doc_id:
            ids.append(doc_id)
        meta = item.get("metadata") or {}
        url = meta.get("source_url")
        if isinstance(url, str) and url:
            sources.append(_normalize_source(url))
    return ids, sources


def _extract_baseline(baseline: Iterable) -> tuple[list[str], list[str]]:
    ids: list[str] = []
    sources: list[str] = []
    for item in baseline:
        if isinstance(item, str):
            ids.append(item)
            continue
        if isinstance(item, dict):
            doc_id = item.get("id")
            if isinstance(doc_id, str) and doc_id:
                ids.append(doc_id)
            url = item.get("source_url")
            if isinstance(url, str) and url:
                sources.append(_normalize_source(url))
    return ids, sources


def _precision_recall(
    retrieved: list[str], gold: set[str], dedupe: bool = False
) -> tuple[float, float]:
    if not gold:
        return 0.0, 0.0
    if dedupe:
        # preserve order while deduping
        seen = set()
        unique = []
        for item in retrieved:
            if item in seen:
                continue
            seen.add(item)
            unique.append(item)
        retrieved = unique
    retrieved_set = set(retrieved)
    hit = len(retrieved_set & gold)
    precision = hit / len(retrieved) if retrieved else 0.0
    recall = hit / len(gold)
    return precision, recall


def _hit_rate(retrieved: list[str], gold: set[str], dedupe: bool = False) -> float:
    if not gold:
        return 0.0
    if dedupe:
        seen = set()
        retrieved = [x for x in retrieved if not (x in seen or seen.add(x))]
    return 1.0 if any(item in gold for item in retrieved) else 0.0


def _reciprocal_rank(
    retrieved: list[str], gold: set[str], dedupe: bool = False
) -> float:
    if not gold:
        return 0.0
    if dedupe:
        seen = set()
        unique = []
        for item in retrieved:
            if item in seen:
                continue
            seen.add(item)
            unique.append(item)
        retrieved = unique
    for idx, item in enumerate(retrieved, 1):
        if item in gold:
            return 1.0 / idx
    return 0.0


def _ndcg(retrieved: list[str], gold: set[str], k: int, dedupe: bool = False) -> float:
    if not gold or k <= 0:
        return 0.0
    if dedupe:
        seen = set()
        unique = []
        for item in retrieved:
            if item in seen:
                continue
            seen.add(item)
            unique.append(item)
        retrieved = unique
    retrieved = retrieved[:k]

    def dcg(items: list[str]) -> float:
        score = 0.0
        for idx, item in enumerate(items, 1):
            if item in gold:
                score += 1.0 / math.log2(idx + 1)
        return score

    ideal_hits = min(len(gold), k)
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, ideal_hits + 1))
    if idcg <= 0:
        return 0.0
    return dcg(retrieved) / idcg


async def _evaluate_item(
    item: dict,
    top_k: int,
    expand_queries: bool,
    use_hyde: bool,
    rerank: bool,
    use_mmr: bool,
    use_bm25: bool,
    semantic_weight: float,
    keyword_weight: float,
    rerank_threshold: float,
    fetch_k: int,
    max_queries: int,
    max_total_queries: int,
    mmr_lambda: float,
    content_type_boosts: Optional[dict[str, float]],
) -> dict:
    company_id = item.get("company_id")
    query = item.get("query") or ""

    results = await dense_hybrid_search(
        company_id=company_id,
        query=query,
        n_results=top_k,
        content_types=None,
        backends=None,
        expand_queries=expand_queries,
        use_hyde=use_hyde,
        rerank=rerank,
        use_mmr=use_mmr,
        use_bm25=use_bm25,
        semantic_weight=semantic_weight,
        keyword_weight=keyword_weight,
        rerank_threshold=rerank_threshold,
        fetch_k=fetch_k,
        max_queries=max_queries,
        max_total_queries=max_total_queries,
        mmr_lambda=mmr_lambda,
        content_type_boosts=content_type_boosts,
    )

    retrieved_ids, retrieved_sources = _extract_retrieved(results)
    gold_ids, gold_sources = _extract_gold(item)

    dense_precision_ids, dense_recall_ids = _precision_recall(retrieved_ids, gold_ids)
    dense_precision_src, dense_recall_src = _precision_recall(
        retrieved_sources, gold_sources, dedupe=True
    )
    dense_hit_ids = _hit_rate(retrieved_ids, gold_ids)
    dense_hit_src = _hit_rate(retrieved_sources, gold_sources, dedupe=True)
    dense_mrr_ids = _reciprocal_rank(retrieved_ids, gold_ids)
    dense_mrr_src = _reciprocal_rank(retrieved_sources, gold_sources, dedupe=True)
    dense_ndcg_ids = _ndcg(retrieved_ids, gold_ids, top_k)
    dense_ndcg_src = _ndcg(retrieved_sources, gold_sources, top_k, dedupe=True)

    baseline_precision_ids = baseline_recall_ids = 0.0
    baseline_precision_src = baseline_recall_src = 0.0
    baseline_hit_ids = baseline_hit_src = 0.0
    baseline_mrr_ids = baseline_mrr_src = 0.0
    baseline_ndcg_ids = baseline_ndcg_src = 0.0

    baseline_topk = item.get("baseline_topk") or []
    if baseline_topk:
        baseline_ids, baseline_sources = _extract_baseline(baseline_topk)
        baseline_precision_ids, baseline_recall_ids = _precision_recall(
            baseline_ids, gold_ids
        )
        baseline_precision_src, baseline_recall_src = _precision_recall(
            baseline_sources, gold_sources, dedupe=True
        )
        baseline_hit_ids = _hit_rate(baseline_ids, gold_ids)
        baseline_hit_src = _hit_rate(baseline_sources, gold_sources, dedupe=True)
        baseline_mrr_ids = _reciprocal_rank(baseline_ids, gold_ids)
        baseline_mrr_src = _reciprocal_rank(baseline_sources, gold_sources, dedupe=True)
        baseline_ndcg_ids = _ndcg(baseline_ids, gold_ids, top_k)
        baseline_ndcg_src = _ndcg(baseline_sources, gold_sources, top_k, dedupe=True)

    return {
        "company_id": company_id,
        "query": query,
        "dense_precision_ids": dense_precision_ids,
        "dense_recall_ids": dense_recall_ids,
        "dense_precision_sources": dense_precision_src,
        "dense_recall_sources": dense_recall_src,
        "dense_hit_ids": dense_hit_ids,
        "dense_hit_sources": dense_hit_src,
        "dense_mrr_ids": dense_mrr_ids,
        "dense_mrr_sources": dense_mrr_src,
        "dense_ndcg_ids": dense_ndcg_ids,
        "dense_ndcg_sources": dense_ndcg_src,
        "baseline_precision_ids": baseline_precision_ids,
        "baseline_recall_ids": baseline_recall_ids,
        "baseline_precision_sources": baseline_precision_src,
        "baseline_recall_sources": baseline_recall_src,
        "baseline_hit_ids": baseline_hit_ids,
        "baseline_hit_sources": baseline_hit_src,
        "baseline_mrr_ids": baseline_mrr_ids,
        "baseline_mrr_sources": baseline_mrr_src,
        "baseline_ndcg_ids": baseline_ndcg_ids,
        "baseline_ndcg_sources": baseline_ndcg_src,
        "dense_retrieved_ids": retrieved_ids,
        "dense_retrieved_sources": retrieved_sources,
    }


def _aggregate(metrics: list[dict], key: str) -> float:
    vals = [m.get(key, 0.0) for m in metrics]
    if not vals:
        return 0.0
    return sum(vals) / len(vals)


def _print_summary(metrics: list[dict]) -> None:
    dense_p_ids = _aggregate(metrics, "dense_precision_ids")
    dense_r_ids = _aggregate(metrics, "dense_recall_ids")
    dense_p_src = _aggregate(metrics, "dense_precision_sources")
    dense_r_src = _aggregate(metrics, "dense_recall_sources")
    dense_hit_ids = _aggregate(metrics, "dense_hit_ids")
    dense_hit_src = _aggregate(metrics, "dense_hit_sources")
    dense_mrr_ids = _aggregate(metrics, "dense_mrr_ids")
    dense_mrr_src = _aggregate(metrics, "dense_mrr_sources")
    dense_ndcg_ids = _aggregate(metrics, "dense_ndcg_ids")
    dense_ndcg_src = _aggregate(metrics, "dense_ndcg_sources")

    base_p_ids = _aggregate(metrics, "baseline_precision_ids")
    base_r_ids = _aggregate(metrics, "baseline_recall_ids")
    base_p_src = _aggregate(metrics, "baseline_precision_sources")
    base_r_src = _aggregate(metrics, "baseline_recall_sources")
    base_hit_ids = _aggregate(metrics, "baseline_hit_ids")
    base_hit_src = _aggregate(metrics, "baseline_hit_sources")
    base_mrr_ids = _aggregate(metrics, "baseline_mrr_ids")
    base_mrr_src = _aggregate(metrics, "baseline_mrr_sources")
    base_ndcg_ids = _aggregate(metrics, "baseline_ndcg_ids")
    base_ndcg_src = _aggregate(metrics, "baseline_ndcg_sources")

    print("=== RAG Retrieval Evaluation ===")
    print(f"Dense Precision@k (IDs): {dense_p_ids:.4f}")
    print(f"Dense Recall@k    (IDs): {dense_r_ids:.4f}")
    print(f"Dense Hit@k       (IDs): {dense_hit_ids:.4f}")
    print(f"Dense MRR@k       (IDs): {dense_mrr_ids:.4f}")
    print(f"Dense nDCG@k      (IDs): {dense_ndcg_ids:.4f}")
    print(f"Dense Precision@k (SRC): {dense_p_src:.4f}")
    print(f"Dense Recall@k    (SRC): {dense_r_src:.4f}")
    print(f"Dense Hit@k       (SRC): {dense_hit_src:.4f}")
    print(f"Dense MRR@k       (SRC): {dense_mrr_src:.4f}")
    print(f"Dense nDCG@k      (SRC): {dense_ndcg_src:.4f}")

    if (
        base_p_ids > 0
        or base_r_ids > 0
        or base_p_src > 0
        or base_r_src > 0
        or base_hit_ids > 0
        or base_hit_src > 0
        or base_mrr_ids > 0
        or base_mrr_src > 0
        or base_ndcg_ids > 0
        or base_ndcg_src > 0
    ):
        print("--- Baseline ---")
        print(f"Baseline Precision@k (IDs): {base_p_ids:.4f}")
        print(f"Baseline Recall@k    (IDs): {base_r_ids:.4f}")
        print(f"Baseline Hit@k       (IDs): {base_hit_ids:.4f}")
        print(f"Baseline MRR@k       (IDs): {base_mrr_ids:.4f}")
        print(f"Baseline nDCG@k      (IDs): {base_ndcg_ids:.4f}")
        print(f"Baseline Precision@k (SRC): {base_p_src:.4f}")
        print(f"Baseline Recall@k    (SRC): {base_r_src:.4f}")
        print(f"Baseline Hit@k       (SRC): {base_hit_src:.4f}")
        print(f"Baseline MRR@k       (SRC): {base_mrr_src:.4f}")
        print(f"Baseline nDCG@k      (SRC): {base_ndcg_src:.4f}")
        print("--- Delta (Dense - Baseline) ---")
        print(f"Δ Precision@k (IDs): {(dense_p_ids - base_p_ids):.4f}")
        print(f"Δ Recall@k    (IDs): {(dense_r_ids - base_r_ids):.4f}")
        print(f"Δ Hit@k       (IDs): {(dense_hit_ids - base_hit_ids):.4f}")
        print(f"Δ MRR@k       (IDs): {(dense_mrr_ids - base_mrr_ids):.4f}")
        print(f"Δ nDCG@k      (IDs): {(dense_ndcg_ids - base_ndcg_ids):.4f}")
        print(f"Δ Precision@k (SRC): {(dense_p_src - base_p_src):.4f}")
        print(f"Δ Recall@k    (SRC): {(dense_r_src - base_r_src):.4f}")
        print(f"Δ Hit@k       (SRC): {(dense_hit_src - base_hit_src):.4f}")
        print(f"Δ MRR@k       (SRC): {(dense_mrr_src - base_mrr_src):.4f}")
        print(f"Δ nDCG@k      (SRC): {(dense_ndcg_src - base_ndcg_src):.4f}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate dense RAG retrieval")
    parser.add_argument("--input", required=True, help="Path to JSONL evaluation set")
    parser.add_argument("--output", help="Optional output JSONL path")
    parser.add_argument("--top-k", type=int, default=5, help="Top-k to evaluate")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of samples")
    parser.add_argument(
        "--no-expand", action="store_true", help="Disable query expansion"
    )
    parser.add_argument("--no-hyde", action="store_true", help="Disable HyDE")
    parser.add_argument("--no-rerank", action="store_true", help="Disable rerank")
    parser.add_argument("--no-mmr", action="store_true", help="Disable MMR")
    parser.add_argument("--no-bm25", action="store_true", help="Disable BM25 merge")
    parser.add_argument("--no-boosts", action="store_true", help="Disable content boosts")
    parser.add_argument(
        "--boosts",
        help="Path to JSON file for content-type boosts (override defaults)",
    )
    parser.add_argument("--semantic-weight", type=float, default=0.6)
    parser.add_argument("--keyword-weight", type=float, default=0.4)
    parser.add_argument("--rerank-threshold", type=float, default=0.7)
    parser.add_argument("--mmr-lambda", type=float, default=0.5)
    parser.add_argument("--fetch-k", type=int, default=30)
    parser.add_argument("--max-queries", type=int, default=3)
    parser.add_argument("--max-total-queries", type=int, default=4)
    parser.add_argument(
        "--sleep", type=float, default=0.0, help="Sleep seconds between requests"
    )
    return parser.parse_args()


async def main_async(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    items = _load_jsonl(input_path)
    if args.limit and args.limit > 0:
        items = items[: args.limit]

    boosts: Optional[dict[str, float]] = CONTENT_TYPE_BOOSTS.get("es_review")
    if args.no_boosts:
        boosts = None
    elif args.boosts:
        boost_path = Path(args.boosts)
        if boost_path.exists():
            raw_boosts = json.loads(boost_path.read_text(encoding="utf-8"))
            if isinstance(raw_boosts, dict) and "es_review" in raw_boosts:
                boosts = raw_boosts.get("es_review")
            elif isinstance(raw_boosts, dict):
                boosts = raw_boosts
            else:
                boosts = None

    metrics: list[dict] = []
    for item in items:
        result = await _evaluate_item(
            item,
            top_k=args.top_k,
            expand_queries=not args.no_expand,
            use_hyde=not args.no_hyde,
            rerank=not args.no_rerank,
            use_mmr=not args.no_mmr,
            use_bm25=not args.no_bm25,
            semantic_weight=args.semantic_weight,
            keyword_weight=args.keyword_weight,
            rerank_threshold=args.rerank_threshold,
            fetch_k=args.fetch_k,
            max_queries=args.max_queries,
            max_total_queries=args.max_total_queries,
            mmr_lambda=args.mmr_lambda,
            content_type_boosts=boosts,
        )
        metrics.append(result)
        if args.sleep:
            time.sleep(args.sleep)

    _print_summary(metrics)

    if args.output:
        output_path = Path(args.output)
        with output_path.open("w", encoding="utf-8") as f:
            for item in metrics:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    return 0


def main() -> int:
    args = parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
