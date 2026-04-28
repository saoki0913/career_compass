from __future__ import annotations

import pytest


def test_metric_functions_handle_rank_and_dedupe_cases():
    from evals.rag import evaluate_retrieval

    gold = {"https://example.com/a", "https://example.com/b"}
    retrieved = [
        "https://example.com/a",
        "https://example.com/a",
        "https://example.com/c",
        "https://example.com/b",
    ]

    precision, recall = evaluate_retrieval._precision_recall(retrieved, gold, dedupe=True)

    assert precision == pytest.approx(2 / 3)
    assert recall == pytest.approx(1.0)
    assert evaluate_retrieval._hit_rate(retrieved, gold, dedupe=True) == pytest.approx(1.0)
    assert evaluate_retrieval._reciprocal_rank(retrieved, gold, dedupe=True) == pytest.approx(1.0)
    assert evaluate_retrieval._ndcg(retrieved, gold, 3, dedupe=True) == pytest.approx(0.919720, rel=1e-5)


@pytest.mark.asyncio
async def test_run_evaluation_uses_item_tenant_key(monkeypatch):
    from evals.rag import evaluate_retrieval

    captured: list[str | None] = []

    async def fake_dense_hybrid_search(**kwargs):
        captured.append(kwargs.get("tenant_key"))
        return []

    monkeypatch.setattr(
        evaluate_retrieval,
        "dense_hybrid_search",
        fake_dense_hybrid_search,
    )

    await evaluate_retrieval.run_evaluation(
        [
            {
                "company_id": "company-1",
                "tenant_key": "a" * 32,
                "query": "採用情報",
                "gold_sources": ["https://example.com/recruit"],
            }
        ],
        evaluate_retrieval.EvalConfig(top_k=1, tenant_key="b" * 32),
    )

    assert captured == ["a" * 32]


@pytest.mark.asyncio
async def test_run_evaluation_falls_back_to_config_tenant_key(monkeypatch):
    from evals.rag import evaluate_retrieval

    captured: list[str | None] = []

    async def fake_dense_hybrid_search(**kwargs):
        captured.append(kwargs.get("tenant_key"))
        return []

    monkeypatch.setattr(
        evaluate_retrieval,
        "dense_hybrid_search",
        fake_dense_hybrid_search,
    )

    await evaluate_retrieval.run_evaluation(
        [
            {
                "company_id": "company-1",
                "query": "採用情報",
                "gold_sources": ["https://example.com/recruit"],
            }
        ],
        evaluate_retrieval.EvalConfig(top_k=1, tenant_key="b" * 32),
    )

    assert captured == ["b" * 32]


@pytest.mark.asyncio
async def test_run_evaluation_requires_tenant_key(monkeypatch):
    from evals.rag import evaluate_retrieval

    async def fake_dense_hybrid_search(**kwargs):
        raise AssertionError("dense_hybrid_search should not be called")

    monkeypatch.setattr(
        evaluate_retrieval,
        "dense_hybrid_search",
        fake_dense_hybrid_search,
    )

    with pytest.raises(ValueError, match="tenant_key is required"):
        await evaluate_retrieval.run_evaluation(
            [
                {
                    "company_id": "company-1",
                    "query": "採用情報",
                    "gold_sources": ["https://example.com/recruit"],
                }
            ],
            evaluate_retrieval.EvalConfig(top_k=1),
        )


def test_eval_result_baseline_dict_is_stable_shape():
    from evals.rag.evaluate_retrieval import EvalResult

    result = EvalResult(
        n_items=50,
        ndcg_at_k_src=0.5,
        mrr_src=0.4,
        hit_rate_src=0.7,
        precision_src=0.3,
        recall_src=0.6,
    )

    assert result.to_baseline_dict() == {
        "ndcg_at_k_src": 0.5,
        "mrr_src": 0.4,
        "hit_rate_src": 0.7,
        "precision_src": 0.3,
        "recall_src": 0.6,
        "n_items": 50,
    }
