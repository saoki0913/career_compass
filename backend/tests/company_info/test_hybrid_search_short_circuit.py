import pytest

from app.rag import hybrid_search
from app.rag.hybrid_search import (
    _select_weak_search_llm_rescue,
    _should_short_circuit_search,
)
from app.utils.embeddings import EmbeddingBackend


def test_short_circuit_when_top_results_are_confident_and_diverse() -> None:
    results = [
        {"boosted_score": 0.92, "metadata": {"content_type": "new_grad_recruitment"}},
        {"boosted_score": 0.85, "metadata": {"content_type": "employee_interviews"}},
        {"boosted_score": 0.83, "metadata": {"content_type": "ceo_message"}},
    ]

    assert _should_short_circuit_search(results, n_results=3) is True


def test_short_circuit_stays_disabled_when_results_are_thin() -> None:
    results = [
        {"boosted_score": 0.64, "metadata": {"content_type": "corporate_site"}},
        {"boosted_score": 0.61, "metadata": {"content_type": "corporate_site"}},
        {"boosted_score": 0.57, "metadata": {"content_type": "corporate_site"}},
    ]

    assert _should_short_circuit_search(results, n_results=3) is False


def test_weak_search_rescue_gate_prefers_expansion_for_fact_lookup() -> None:
    results = [
        {"boosted_score": 0.42, "metadata": {"content_type": "corporate_site"}},
        {"boosted_score": 0.38, "metadata": {"content_type": "corporate_site"}},
    ]

    assert (
        _select_weak_search_llm_rescue(
            "応募締切と募集要項を確認したい",
            results,
            profile="fact_lookup",
            effective_expand=True,
            effective_hyde=True,
        )
        == "expansion"
    )


def test_weak_search_rescue_gate_prefers_hyde_for_long_semantic_query() -> None:
    results = [
        {"boosted_score": 0.52, "metadata": {"content_type": "employee_interviews"}},
        {"boosted_score": 0.47, "metadata": {"content_type": "ceo_message"}},
    ]
    query = (
        "自分の経験と企業の価値観をつなげるために、顧客への向き合い方や"
        "組織として大切にしている判断軸を深く知りたい"
    )

    assert (
        _select_weak_search_llm_rescue(
            query,
            results,
            profile="culture_fit",
            effective_expand=True,
            effective_hyde=True,
        )
        == "hyde"
    )


@pytest.mark.asyncio
async def test_dense_search_default_rescue_runs_only_one_llm_strategy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    semantic_queries: list[str] = []

    async def fake_semantic_search(**kwargs: object) -> list[dict]:
        q = str(kwargs["query"])
        semantic_queries.append(q)
        return [
            {
                "id": f"doc-{len(semantic_queries)}",
                "document": f"{q} result",
                "boosted_score": 0.42,
                "metadata": {"content_type": "corporate_site"},
            }
        ]

    async def fake_expand(*_args: object, **_kwargs: object) -> list[str]:
        events.append("expansion")
        return ["応募締切 募集要項"]

    async def fake_hyde(*_args: object, **_kwargs: object) -> str:
        events.append("hyde")
        return "hypothetical passage"

    monkeypatch.setattr(hybrid_search, "semantic_search", fake_semantic_search)
    monkeypatch.setattr(hybrid_search, "expand_queries_with_llm", fake_expand)
    monkeypatch.setattr(hybrid_search, "generate_hypothetical_document", fake_hyde)

    result = await hybrid_search.dense_hybrid_search(
        company_id="company-1",
        query="応募締切と募集要項を確認したい",
        n_results=3,
        backends=[EmbeddingBackend(provider="openai", model="test", dimension=3)],
        expand_queries=True,
        use_hyde=True,
        rerank=False,
        use_mmr=False,
        use_bm25=False,
        tenant_key="tenant-1",
    )

    assert result
    assert events == ["expansion"]
    assert "hypothetical passage" not in semantic_queries
