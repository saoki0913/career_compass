from pathlib import Path

import pytest


def test_vector_store_does_not_own_hybrid_retrieval_imports() -> None:
    source = Path("backend/app/rag/vector_store.py").read_text()

    assert "app.rag.hybrid_search import" not in source


def test_hybrid_search_does_not_import_vector_store_refresh() -> None:
    source = Path("backend/app/rag/hybrid_search.py").read_text()

    assert "from app.rag.vector_store import update_bm25_index" not in source
    assert "from app.rag.bm25_refresh import update_bm25_index" in source


def test_hybrid_retrieval_lives_in_retrieval_module() -> None:
    source = Path("backend/app/rag/retrieval.py").read_text()

    assert "from app.rag.hybrid_search import" in source


def test_vector_store_preserves_deletion_helper_alias() -> None:
    from app.rag import vector_store
    from app.rag.vector_store_deletion import extract_ids_to_delete_for_source

    assert vector_store._extract_ids_to_delete_for_source is extract_ids_to_delete_for_source


@pytest.mark.asyncio
async def test_vector_store_enhanced_search_wrapper_delegates(monkeypatch) -> None:
    from app.rag import retrieval, vector_store

    calls: list[dict] = []

    async def fake_impl(**kwargs):
        calls.append(kwargs)
        return [{"text": "context"}]

    monkeypatch.setattr(retrieval, "hybrid_search_company_context_enhanced", fake_impl)

    result = await vector_store.hybrid_search_company_context_enhanced(
        company_id="company-1",
        query="採用方針",
        n_results=3,
        content_types=["new_grad_recruitment"],
        use_bm25=False,
        priority_source_urls=["https://example.com/recruit"],
        tenant_key="a" * 32,
    )

    assert result == [{"text": "context"}]
    assert calls == [
        {
            "company_id": "company-1",
            "query": "採用方針",
            "n_results": 3,
            "content_types": ["new_grad_recruitment"],
            "backends": None,
            "expand_queries": True,
            "rerank": True,
            "use_bm25": False,
            "profile_overrides": None,
            "content_type_boosts": None,
            "priority_source_urls": ["https://example.com/recruit"],
            "short_circuit": True,
            "tenant_key": "a" * 32,
        }
    ]
