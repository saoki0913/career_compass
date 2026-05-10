"""Hybrid retrieval orchestration for company RAG.

`vector_store.py` remains the public compatibility facade for callers that
already import retrieval helpers from there. New hybrid retrieval behavior
belongs here so storage concerns do not keep accumulating in the Chroma facade.
"""

from typing import Optional

from app.config import settings
from app.utils.embeddings import EmbeddingBackend
from app.utils.cache import build_cache_key, get_rag_cache


async def hybrid_search_company_context(
    company_id: str,
    query: str,
    n_results: int = 10,
    content_types: Optional[list[str]] = None,
    semantic_weight: float = 0.6,
    keyword_weight: float = 0.4,
    backends: Optional[list[EmbeddingBackend]] = None,
    *,
    tenant_key: str,
) -> list[dict]:
    """Perform hybrid retrieval by combining dense and keyword search."""
    from app.rag.hybrid_search import hybrid_search

    return await hybrid_search(
        company_id=company_id,
        query=query,
        n_results=n_results,
        content_types=content_types,
        semantic_weight=semantic_weight,
        keyword_weight=keyword_weight,
        use_rrf=True,
        backends=backends,
        tenant_key=tenant_key,
    )


async def hybrid_search_company_context_enhanced(
    company_id: str,
    query: str,
    n_results: int = 10,
    content_types: Optional[list[str]] = None,
    backends: Optional[list[EmbeddingBackend]] = None,
    expand_queries: bool = True,
    rerank: bool = True,
    use_bm25: Optional[bool] = None,
    profile_overrides: Optional[dict] = None,
    content_type_boosts: Optional[dict[str, float]] = None,
    priority_source_urls: Optional[list[str]] = None,
    short_circuit: bool = True,
    *,
    tenant_key: str,
) -> list[dict]:
    """Run enhanced dense/hybrid retrieval with expansion, MMR, and reranking."""
    from app.rag.hybrid_search import (
        dense_hybrid_search,
        infer_retrieval_profile,
        select_boost_profile,
    )

    profile = infer_retrieval_profile(query, base_fetch_k=settings.rag_fetch_k)
    if profile_overrides:
        profile.update(profile_overrides)
    semantic_weight = float(profile.get("semantic_weight", settings.rag_semantic_weight))
    keyword_weight = float(profile.get("keyword_weight", settings.rag_keyword_weight))
    fetch_k = int(profile.get("fetch_k", settings.rag_fetch_k))
    max_queries = min(
        settings.rag_max_queries,
        int(profile.get("max_queries", settings.rag_max_queries)),
    )
    max_total_queries = min(
        settings.rag_max_total_queries,
        int(profile.get("max_total_queries", settings.rag_max_total_queries)),
    )
    rerank_threshold = float(
        profile.get("rerank_threshold", settings.rag_rerank_threshold)
    )
    mmr_lambda = float(profile.get("mmr_lambda", settings.rag_mmr_lambda))
    use_hyde = settings.rag_use_hyde and bool(profile.get("use_hyde", True))
    effective_bm25 = settings.rag_keyword_weight > 0 if use_bm25 is None else use_bm25

    return await dense_hybrid_search(
        company_id=company_id,
        query=query,
        n_results=n_results,
        content_types=content_types,
        backends=backends,
        expand_queries=expand_queries,
        use_hyde=use_hyde,
        rerank=rerank,
        use_mmr=settings.rag_use_mmr,
        semantic_weight=semantic_weight,
        keyword_weight=keyword_weight,
        rerank_threshold=rerank_threshold,
        fetch_k=fetch_k,
        max_queries=max_queries,
        max_total_queries=max_total_queries,
        mmr_lambda=mmr_lambda,
        content_type_boosts=content_type_boosts or select_boost_profile(query),
        priority_source_urls=priority_source_urls,
        use_bm25=effective_bm25,
        short_circuit=short_circuit,
        tenant_key=tenant_key,
    )


async def get_enhanced_context_for_review(
    company_id: str,
    es_content: str,
    max_context_length: Optional[int] = None,
    search_options: Optional[dict] = None,
    *,
    tenant_key: str,
) -> str:
    """Get enhanced formatted context for ES review."""
    from app.rag import vector_store as store
    from app.rag.hybrid_search import get_context_for_review_hybrid

    if max_context_length is None:
        max_context_length = store.get_dynamic_context_length(es_content)

    cache = get_rag_cache()
    cache_key = build_cache_key(
        "enhanced_context",
        company_id,
        tenant_key,
        es_content,
        str(max_context_length),
        store._search_options_signature(search_options),
    )
    if cache:
        cached = await cache.get_context(company_id, cache_key, tenant_key=tenant_key)
        if isinstance(cached, dict) and isinstance(cached.get("context"), str):
            return cached["context"]

    results = await store.hybrid_search_company_context_enhanced(
        company_id=company_id,
        query=es_content,
        n_results=15,
        content_types=None,
        expand_queries=(search_options or {}).get(
            "expand_queries", settings.rag_use_query_expansion
        ),
        rerank=(search_options or {}).get("rerank", settings.rag_use_rerank),
        use_bm25=(search_options or {}).get("use_bm25"),
        profile_overrides=(search_options or {}).get("profile_overrides"),
        content_type_boosts=(search_options or {}).get("content_type_boosts"),
        priority_source_urls=(search_options or {}).get("priority_source_urls"),
        short_circuit=(search_options or {}).get("short_circuit", True),
        tenant_key=tenant_key,
    )

    if not results:
        context = await store.get_company_context_for_review(
            company_id=company_id,
            es_content=es_content,
            max_context_length=max_context_length,
            tenant_key=tenant_key,
        )
        if cache:
            await cache.set_context(
                company_id,
                cache_key,
                {"context": context},
                tenant_key=tenant_key,
            )
        return context

    context = get_context_for_review_hybrid(results, max_context_length)
    if cache:
        await cache.set_context(
            company_id,
            cache_key,
            {"context": context},
            tenant_key=tenant_key,
        )
    return context


async def get_enhanced_context_for_review_with_sources(
    company_id: str,
    es_content: str,
    max_context_length: Optional[int] = None,
    search_options: Optional[dict] = None,
    *,
    tenant_key: str,
) -> tuple[str, list[dict]]:
    """Get enhanced formatted context and source metadata for ES review."""
    from app.rag import vector_store as store
    from app.rag.hybrid_search import get_context_and_sources_for_review_hybrid

    if max_context_length is None:
        max_context_length = store.get_dynamic_context_length(es_content)

    cache = get_rag_cache()
    cache_key = build_cache_key(
        "enhanced_context_sources",
        company_id,
        tenant_key,
        es_content,
        str(max_context_length),
        store._search_options_signature(search_options),
    )
    if cache:
        cached = await cache.get_context(company_id, cache_key, tenant_key=tenant_key)
        if (
            isinstance(cached, dict)
            and isinstance(cached.get("context"), str)
            and isinstance(cached.get("sources"), list)
        ):
            return cached["context"], cached["sources"]

    results = await store.hybrid_search_company_context_enhanced(
        company_id=company_id,
        query=es_content,
        n_results=15,
        content_types=None,
        expand_queries=(search_options or {}).get(
            "expand_queries", settings.rag_use_query_expansion
        ),
        rerank=(search_options or {}).get("rerank", settings.rag_use_rerank),
        use_bm25=(search_options or {}).get("use_bm25"),
        profile_overrides=(search_options or {}).get("profile_overrides"),
        content_type_boosts=(search_options or {}).get("content_type_boosts"),
        priority_source_urls=(search_options or {}).get("priority_source_urls"),
        short_circuit=(search_options or {}).get("short_circuit", True),
        tenant_key=tenant_key,
    )

    if not results:
        context = await store.get_company_context_for_review(
            company_id=company_id,
            es_content=es_content,
            max_context_length=max_context_length,
            tenant_key=tenant_key,
        )
        if cache:
            await cache.set_context(
                company_id,
                cache_key,
                {"context": context, "sources": []},
                tenant_key=tenant_key,
            )
        return context, []

    context, sources = get_context_and_sources_for_review_hybrid(
        results, max_context_length
    )
    if cache:
        await cache.set_context(
            company_id,
            cache_key,
            {"context": context, "sources": sources},
            tenant_key=tenant_key,
        )
    return context, sources
