"""
Hybrid Search Module

Dense-only retrieval pipeline (no BM25).
Uses multi-query + HyDE + RRF + MMR + LLM rerank.
"""

import json
import math
from collections import Counter
from typing import Optional

from app.utils.llm import call_llm_with_error
from app.utils.content_types import content_type_label, normalize_content_type, expand_content_type_filter
from app.utils.embeddings import EmbeddingBackend, generate_embedding, resolve_embedding_backend
from app.utils.bm25_store import get_or_create_index
from app.utils.japanese_tokenizer import tokenize

# Retrieval tuning defaults
DEFAULT_MAX_QUERIES = 3
DEFAULT_MAX_TOTAL_QUERIES = 4
DEFAULT_FETCH_K = 30
DEFAULT_MMR_LAMBDA = 0.5
DEFAULT_RERANK_CANDIDATES = 20
HYDE_MAX_QUERY_CHARS = 600
EXPANSION_MAX_QUERY_CHARS = 1200
# 短いクエリ（10文字未満）ではクエリ拡張をスキップ
EXPANSION_MIN_QUERY_CHARS = 10

QUERY_EXPANSION_SCHEMA = {
    "name": "rag_query_expansion",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["queries"],
        "properties": {
            "queries": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 5,
            }
        },
    },
}

HYDE_SCHEMA = {
    "name": "rag_hyde_passage",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["passage"],
        "properties": {
            "passage": {"type": "string"}
        },
    },
}

RERANK_SCHEMA = {
    "name": "rag_rerank_scores",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["ranked"],
        "properties": {
            "ranked": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["id", "score"],
                    "properties": {
                        "id": {"type": "string"},
                        "score": {"type": "number", "minimum": 0, "maximum": 100},
                    },
                },
            }
        },
    },
}


def rrf_merge_results(results_by_query: list[list[dict]], k: int = 60) -> list[dict]:
    """Merge multiple result lists using Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}
    best_items: dict[str, dict] = {}

    for results in results_by_query:
        for rank, item in enumerate(results):
            doc_id = item.get("id")
            if not doc_id:
                continue
            rrf_score = 1 / (k + rank + 1)
            scores[doc_id] = scores.get(doc_id, 0) + rrf_score
            if doc_id not in best_items:
                best_items[doc_id] = item

    merged = []
    for doc_id, score in scores.items():
        item = dict(best_items[doc_id])
        item["rrf_score"] = score
        merged.append(item)

    merged.sort(key=lambda x: x.get("rrf_score", 0), reverse=True)
    return merged


def _dedupe_queries(queries: list[str], max_total: int) -> list[str]:
    """Deduplicate query list while preserving order and trimming to max_total."""
    seen = set()
    cleaned = []
    for q in queries:
        q = (q or "").strip()
        if not q or q in seen:
            continue
        seen.add(q)
        cleaned.append(q)
        if len(cleaned) >= max_total:
            break
    return cleaned


def _extract_keywords(text: str, max_terms: int = 8) -> list[str]:
    tokens = tokenize(text)
    filtered = [t for t in tokens if len(t) >= 2]
    if not filtered:
        return []
    counts = Counter(filtered)
    return [term for term, _ in counts.most_common(max_terms)]


def _should_rerank(results: list[dict], threshold: float) -> bool:
    if not results:
        return False
    scores = [item.get("rrf_score", 0) for item in results[:5]]
    max_score = max(scores) if scores else 0.0
    if max_score <= 0:
        return True
    normalized = [s / max_score for s in scores]
    top_n = normalized[:3]
    avg_top = sum(top_n) / len(top_n) if top_n else 0.0
    return avg_top < threshold


def _normalize_scores(score_map: dict[str, float]) -> dict[str, float]:
    if not score_map:
        return {}
    max_score = max(score_map.values()) or 0.0
    if max_score <= 0:
        return {k: 0.0 for k in score_map}
    return {k: v / max_score for k, v in score_map.items()}


def _keyword_search(
    company_id: str,
    query: str,
    k: int = 10,
    content_types: Optional[list[str]] = None
) -> list[dict]:
    index = get_or_create_index(company_id)
    if not index.documents:
        try:
            from app.utils.vector_store import update_bm25_index
            update_bm25_index(company_id)
            index = get_or_create_index(company_id)
        except Exception:
            pass
    if not index.documents:
        return []
    results = index.search(query, k=k)
    if not results:
        return []

    allowed_types = None
    if content_types:
        allowed_types = set(expand_content_type_filter(content_types))

    output: list[dict] = []
    for doc_id, score in results:
        doc = index.get_document(doc_id)
        if not doc:
            continue
        metadata = doc.metadata or {}
        content_type = normalize_content_type(metadata.get("content_type") or metadata.get("chunk_type") or "structured")
        if allowed_types and content_type not in allowed_types:
            continue
        output.append({
            "id": doc.doc_id,
            "text": doc.text,
            "metadata": metadata,
            "bm25_score": score,
        })
    return output


def _merge_semantic_and_keyword(
    semantic_results: list[dict],
    keyword_results: list[dict],
    semantic_weight: float,
    keyword_weight: float
) -> list[dict]:
    semantic_scores = {}
    for item in semantic_results:
        item_id = item.get("id")
        if not item_id:
            continue
        score = item.get("rrf_score")
        if score is None:
            distance = item.get("distance")
            if isinstance(distance, (int, float)):
                score = 1 / (distance + 1e-6)
            else:
                score = 0.0
        semantic_scores[item_id] = float(score)

    keyword_scores = {}
    for item in keyword_results:
        item_id = item.get("id")
        if not item_id:
            continue
        keyword_scores[item_id] = float(item.get("bm25_score", 0.0))

    semantic_norm = _normalize_scores(semantic_scores)
    keyword_norm = _normalize_scores(keyword_scores)

    merged: list[dict] = []
    seen: set[str] = set()
    for item in semantic_results + keyword_results:
        item_id = item.get("id")
        if not item_id or item_id in seen:
            continue
        seen.add(item_id)
        semantic_score = semantic_norm.get(item_id, 0.0)
        keyword_score = keyword_norm.get(item_id, 0.0)
        hybrid_score = semantic_weight * semantic_score + keyword_weight * keyword_score
        enriched = dict(item)
        enriched["semantic_score"] = semantic_score
        enriched["keyword_score"] = keyword_score
        enriched["hybrid_score"] = hybrid_score
        merged.append(enriched)

    merged.sort(key=lambda x: x.get("hybrid_score", 0), reverse=True)
    return merged


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def _embeddings_compatible(query_embedding: list[float], candidates: list[dict]) -> bool:
    """Check embedding compatibility for MMR."""
    if not query_embedding:
        return False
    dim = len(query_embedding)
    for item in candidates:
        emb = item.get("embedding")
        if not isinstance(emb, list) or len(emb) != dim:
            return False
    return True


def _apply_mmr(
    candidates: list[dict],
    query_embedding: list[float],
    k: int,
    lambda_mult: float = DEFAULT_MMR_LAMBDA
) -> list[dict]:
    """Apply Maximal Marginal Relevance to diversify results."""
    if not candidates or k <= 0:
        return []
    if not _embeddings_compatible(query_embedding, candidates):
        return candidates[:k]

    selected: list[dict] = []
    remaining = candidates.copy()

    while remaining and len(selected) < k:
        best_idx = None
        best_score = -1e9
        for idx, item in enumerate(remaining):
            emb = item.get("embedding")
            if not isinstance(emb, list):
                continue
            sim_to_query = _cosine_similarity(query_embedding, emb)
            sim_to_selected = 0.0
            if selected:
                sim_to_selected = max(
                    _cosine_similarity(emb, sel.get("embedding", [])) for sel in selected
                )
            score = lambda_mult * sim_to_query - (1 - lambda_mult) * sim_to_selected
            if score > best_score:
                best_score = score
                best_idx = idx

        if best_idx is None:
            break
        selected.append(remaining.pop(best_idx))

    return selected


def _resolve_dense_backend(backends: Optional[list[EmbeddingBackend]]) -> Optional[EmbeddingBackend]:
    """Pick a single backend to avoid mixing embedding spaces."""
    if backends:
        return backends[0]
    return resolve_embedding_backend()


async def expand_queries_with_llm(
    query: str,
    max_queries: int = DEFAULT_MAX_QUERIES,
    keywords: Optional[list[str]] = None
) -> list[str]:
    """Generate query variations to improve recall."""
    system_prompt = """あなたは就活ES向けのRAG検索クエリ拡張アシスタントです。
採用情報・事業情報・人材要件・企業文化に関連する検索クエリを生成してください。
出力はJSONのみ。"""

    user_message = f"""元のクエリ:
{query}

指示:
- 元のクエリと重複しない表現を優先
- 企業の事業/採用/人材像/選考/応募方法に関連する語を含める
- 募集職種、配属、育成、カルチャーなど就活文脈を意識
- 最大{max_queries}件まで
"""

    if keywords:
        user_message += f"""
重要キーワード:
{", ".join(keywords)}
"""

    user_message += """
出力形式:
{{"queries": ["...","..."]}}"""

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=300,
        temperature=0.1,
        feature="rag_query",
        response_format="json_schema",
        json_schema=QUERY_EXPANSION_SCHEMA,
        use_responses_api=True,
    )

    if not llm_result.success or not llm_result.data:
        return []

    queries = llm_result.data.get("queries", [])
    clean = []
    for q in queries:
        if isinstance(q, str):
            q = q.strip()
            if q and q not in clean:
                clean.append(q)
    return clean[:max_queries]


async def generate_hypothetical_document(query: str) -> str:
    """Generate a hypothetical passage (HyDE) to improve recall."""
    system_prompt = """あなたはRAG検索のHyDE生成アシスタントです。
ユーザーのクエリに対して、検索に使える具体的な説明文（仮想文書）を日本語で生成してください。
出力はJSONのみ。"""

    user_message = f"""クエリ:
{query}

指示:
- 採用情報/企業情報/事業/人物像に関連する具体文を生成
- 300〜500文字程度

出力形式:
{{"passage": "..."}}"""

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=500,
        temperature=0.2,
        feature="rag_query",
        response_format="json_schema",
        json_schema=HYDE_SCHEMA,
        use_responses_api=True,
    )

    if not llm_result.success or not llm_result.data:
        return ""

    passage = llm_result.data.get("passage", "")
    if isinstance(passage, str):
        passage = passage.strip()
        if len(passage) > 1200:
            passage = passage[:1200]
        return passage
    return ""


async def rerank_results_with_llm(
    query: str,
    results: list[dict],
    max_items: int = DEFAULT_RERANK_CANDIDATES,
) -> list[dict]:
    """Rerank results using an LLM scorer. Returns original order on failure."""
    if not results:
        return results

    candidates = []
    for item in results[:max_items]:
        candidates.append({
            "id": item.get("id", ""),
            "text": (item.get("text") or "")[:400],
            "content_type": (item.get("metadata") or {}).get("content_type", ""),
            "chunk_type": (item.get("metadata") or {}).get("chunk_type", ""),
            "source_url": (item.get("metadata") or {}).get("source_url", ""),
        })

    system_prompt = """あなたはRAG検索の再ランキング用スコアラーです。
与えられた候補に対して、クエリとの関連度を0〜100で採点してください。
JSONのみで返してください。"""

    user_message = f"""クエリ:
{query}

候補:
{json.dumps(candidates, ensure_ascii=False, indent=2)}

出力形式:
{{"ranked": [{{"id":"...", "score": 0}}, ...]}}"""

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=1500,
        temperature=0.2,
        feature="rag_rerank",
        response_format="json_schema",
        json_schema=RERANK_SCHEMA,
        use_responses_api=True,
    )

    if not llm_result.success or not llm_result.data:
        return results

    ranked = llm_result.data.get("ranked", [])
    score_map = {item.get("id"): item.get("score", 0) for item in ranked if item.get("id")}

    def score(item: dict) -> float:
        return score_map.get(item.get("id"), 0)

    reranked = sorted(results, key=score, reverse=True)
    return reranked


async def semantic_search(
    company_id: str,
    query: str,
    n_results: int = 10,
    content_types: Optional[list[str]] = None,
    backends: Optional[list[EmbeddingBackend]] = None,
    include_embeddings: bool = False,
) -> list[dict]:
    """Run semantic search for a single query."""
    from app.utils.vector_store import search_company_context_by_type

    return await search_company_context_by_type(
        company_id=company_id,
        query=query,
        n_results=n_results,
        content_types=content_types,
        backends=backends,
        include_embeddings=include_embeddings,
    )


async def dense_hybrid_search(
    company_id: str,
    query: str,
    n_results: int = 10,
    content_types: Optional[list[str]] = None,
    backends: Optional[list[EmbeddingBackend]] = None,
    expand_queries: bool = True,
    use_hyde: bool = True,
    rerank: bool = True,
    use_mmr: bool = True,
    semantic_weight: float = 0.6,
    keyword_weight: float = 0.4,
    rerank_threshold: float = 0.7,
    use_bm25: bool = True,
) -> list[dict]:
    """
    Dense-only hybrid search pipeline (BM25-free).

    Steps:
    1) Multi-query expansion
    2) HyDE (optional)
    3) Semantic search per query
    4) RRF merge
    5) MMR (optional)
    6) LLM rerank (optional)
    """
    query = (query or "").strip()
    if not query:
        return []

    base_backend = _resolve_dense_backend(backends)
    if base_backend is None:
        return []
    search_backends = [base_backend]

    # クエリ拡張: 10文字以上1200文字以下の場合のみ実行
    effective_expand = (
        expand_queries
        and len(query) >= EXPANSION_MIN_QUERY_CHARS
        and len(query) <= EXPANSION_MAX_QUERY_CHARS
    )
    effective_hyde = use_hyde and len(query) <= HYDE_MAX_QUERY_CHARS

    queries = [query]

    expanded: list[str] = []
    keyword_seeds = _extract_keywords(query)
    if effective_expand:
        expanded = await expand_queries_with_llm(
            query,
            max_queries=DEFAULT_MAX_QUERIES,
            keywords=keyword_seeds
        )

    if effective_hyde:
        # Reserve one slot for HyDE if we already have many expansions
        if len(expanded) > 2:
            expanded = expanded[:2]

    if expanded:
        queries.extend(expanded)

    if effective_hyde:
        hyde_doc = await generate_hypothetical_document(query)
        if hyde_doc:
            queries.append(hyde_doc)

    queries = _dedupe_queries(queries, DEFAULT_MAX_TOTAL_QUERIES)

    fetch_k = max(DEFAULT_FETCH_K, n_results * 3)
    results_by_query: list[list[dict]] = []

    for q in queries:
        results = await semantic_search(
            company_id=company_id,
            query=q,
            n_results=fetch_k,
            content_types=content_types,
            backends=search_backends,
            include_embeddings=use_mmr,
        )
        if results:
            results_by_query.append(results)

    if not results_by_query:
        return []

    merged = rrf_merge_results(results_by_query)

    if use_mmr:
        query_embedding = await generate_embedding(query, backend=base_backend)
        if query_embedding:
            merged = _apply_mmr(merged, query_embedding, n_results, DEFAULT_MMR_LAMBDA)
        else:
            merged = merged[:n_results]
    else:
        merged = merged[:n_results]

    if rerank and _should_rerank(merged, rerank_threshold):
        merged = await rerank_results_with_llm(query, merged, max_items=DEFAULT_RERANK_CANDIDATES)
    elif rerank:
        print("[RAG再ランキング] ℹ️ 上位スコアが高いためスキップ")

    if use_bm25 and keyword_weight > 0:
        keyword_results = _keyword_search(
            company_id=company_id,
            query=query,
            k=max(DEFAULT_FETCH_K, n_results * 3),
            content_types=content_types,
        )
        if keyword_results:
            merged = _merge_semantic_and_keyword(
                merged,
                keyword_results,
                semantic_weight=semantic_weight,
                keyword_weight=keyword_weight
            )

    return merged[:n_results]


async def hybrid_search(
    company_id: str,
    query: str,
    n_results: int = 10,
    content_types: Optional[list[str]] = None,
    semantic_weight: float = 0.6,
    keyword_weight: float = 0.4,
    use_rrf: bool = True,
    backends: Optional[list[EmbeddingBackend]] = None,
) -> list[dict]:
    """
    Backward-compatible entry point (single-query dense search).

    Note: semantic_weight/keyword_weight/use_rrf are legacy params retained
    for compatibility and are not used in the BM25-free pipeline.
    """
    _ = (semantic_weight, keyword_weight, use_rrf)

    base_backend = _resolve_dense_backend(backends)
    if base_backend is None:
        return []

    semantic_results = await semantic_search(
        company_id=company_id,
        query=query,
        n_results=n_results,
        content_types=content_types,
        backends=[base_backend],
        include_embeddings=False,
    )

    if keyword_weight <= 0:
        return semantic_results

    keyword_results = _keyword_search(
        company_id=company_id,
        query=query,
        k=max(DEFAULT_FETCH_K, n_results * 3),
        content_types=content_types,
    )
    if not keyword_results:
        return semantic_results

    merged = _merge_semantic_and_keyword(
        semantic_results,
        keyword_results,
        semantic_weight=semantic_weight,
        keyword_weight=keyword_weight
    )
    return merged[:n_results]


def get_context_for_review_hybrid(
    results: list[dict],
    max_context_length: int = 3000
) -> str:
    """
    Format hybrid search results as context for ES review.

    Args:
        results: List of search results from hybrid_search
        max_context_length: Maximum context length in characters

    Returns:
        Formatted context string
    """
    if not results:
        return ""

    # Type labels for formatting
    type_labels = {
        "deadline": "締切情報",
        "recruitment_type": "募集区分",
        "required_documents": "提出物",
        "application_method": "応募方法",
        "selection_process": "選考プロセス",
        "full_text": "企業情報",
        "general": "企業情報",
    }

    # content_type labels are handled via content_types helper

    context_parts = []
    total_length = 0

    for result in results:
        text = result.get("text", "")
        metadata = result.get("metadata", {})

        chunk_type = metadata.get("chunk_type", "general")
        content_type = metadata.get("content_type", "structured")
        normalized_type = normalize_content_type(content_type)

        # Format with type labels
        type_label = type_labels.get(chunk_type, "企業情報")
        source_label = content_type_label(normalized_type)
        heading = metadata.get("heading_path") or metadata.get("heading")

        heading_line = f"見出し: {heading}\n" if heading else ""

        if source_label:
            formatted = f"【{type_label}】（{source_label}）\n{heading_line}{text}"
        else:
            formatted = f"【{type_label}】\n{heading_line}{text}"

        # Check length
        if total_length + len(formatted) > max_context_length:
            # Truncate if needed
            remaining = max_context_length - total_length - 10
            if remaining > 100:
                formatted = formatted[:remaining] + "..."
                context_parts.append(formatted)
            break

        context_parts.append(formatted)
        total_length += len(formatted) + 2  # +2 for newlines

    return "\n\n".join(context_parts)


def get_context_and_sources_for_review_hybrid(
    results: list[dict],
    max_context_length: int = 3000
) -> tuple[str, list[dict]]:
    """
    Format hybrid search results as context for ES review with source tracking.

    Args:
        results: List of search results from hybrid_search
        max_context_length: Maximum context length in characters

    Returns:
        Tuple of:
        - context_text: Formatted context string
        - sources: List of source dicts with source_id, source_url, content_type, excerpt
                   Deduplicated by source_url, max 5 items, assigned S1..S5
    """
    if not results:
        return "", []

    # Type labels for formatting
    type_labels = {
        "deadline": "締切情報",
        "recruitment_type": "募集区分",
        "required_documents": "提出物",
        "application_method": "応募方法",
        "selection_process": "選考プロセス",
        "full_text": "企業情報",
        "general": "企業情報",
    }

    # content_type labels are handled via content_types helper

    context_parts = []
    total_length = 0

    # Track unique sources by URL
    seen_urls: set[str] = set()
    sources: list[dict] = []

    for result in results:
        text = result.get("text", "")
        metadata = result.get("metadata", {})

        chunk_type = metadata.get("chunk_type", "general")
        content_type = metadata.get("content_type", "structured")
        normalized_type = normalize_content_type(content_type)
        source_url = metadata.get("source_url", "")

        # Track source (deduplicate by URL)
        if source_url and source_url not in seen_urls and len(sources) < 5:
            seen_urls.add(source_url)
            sources.append({
                "source_id": f"S{len(sources) + 1}",
                "source_url": source_url,
                "content_type": normalized_type,
                "chunk_type": chunk_type,
                "excerpt": text[:150] + "..." if len(text) > 150 else text,
            })

        # Format with type labels
        type_label = type_labels.get(chunk_type, "企業情報")
        source_label = content_type_label(normalized_type)
        heading = metadata.get("heading_path") or metadata.get("heading")
        heading_line = f"見出し: {heading}\n" if heading else ""

        # Find source_id for this result
        source_id = ""
        for src in sources:
            if src["source_url"] == source_url:
                source_id = src["source_id"]
                break

        if source_label:
            if source_id:
                formatted = f"【{type_label}】（{source_label}）[{source_id}]\n{heading_line}{text}"
            else:
                formatted = f"【{type_label}】（{source_label}）\n{heading_line}{text}"
        else:
            if source_id:
                formatted = f"【{type_label}】[{source_id}]\n{heading_line}{text}"
            else:
                formatted = f"【{type_label}】\n{heading_line}{text}"

        # Check length
        if total_length + len(formatted) > max_context_length:
            # Truncate if needed
            remaining = max_context_length - total_length - 10
            if remaining > 100:
                formatted = formatted[:remaining] + "..."
                context_parts.append(formatted)
            break

        context_parts.append(formatted)
        total_length += len(formatted) + 2  # +2 for newlines

    return "\n\n".join(context_parts), sources
