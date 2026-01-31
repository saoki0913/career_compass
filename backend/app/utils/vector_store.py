"""
Vector Store Utility Module

Provides vector storage and retrieval using ChromaDB for company RAG.

Supports:
- Structured data storage (deadlines, recruitment info, etc.)
- Full text storage from recruitment pages
- Corporate site content storage (IR, business info)
- Content type filtering for retrieval
"""

import chromadb
from chromadb.config import Settings as ChromaSettings
from pathlib import Path
from typing import Optional
from datetime import datetime

from app.config import settings
from app.utils.embeddings import (
    EmbeddingBackend,
    generate_embedding,
    generate_embeddings_batch,
    resolve_embedding_backend,
    get_available_backends,
    get_configured_backends,
)
from app.utils.content_types import (
    CONTENT_TYPES_ALL,
    CONTENT_TYPES_NEW,
    LEGACY_CONTENT_TYPES,
    STRUCTURED_CONTENT_TYPE,
    NEW_TO_LEGACY,
    normalize_content_type,
    expand_content_type_filter,
)
from app.utils.content_classifier import classify_chunks
from app.utils.cache import get_rag_cache, build_cache_key
from app.utils.text_chunker import get_chunk_settings

# ChromaDB persistent storage path
CHROMA_PERSIST_DIR = Path(__file__).parent.parent.parent / "data" / "chroma"

# Collection names
COMPANY_COLLECTION = "company_info"
LEGACY_COLLECTION_NAME = "company_info"

# Singleton client
_chroma_client: Optional[chromadb.PersistentClient] = None

# Content type display names (Japanese)
CONTENT_TYPE_JA = {
    "new_grad_recruitment": "新卒採用ホームページ",
    "midcareer_recruitment": "中途採用ホームページ",
    "recruitment_homepage": "採用ホームページ",  # Legacy
    "corporate_site": "企業HP",
    "ir_materials": "IR資料",
    "ceo_message": "社長メッセージ",
    "employee_interviews": "社員インタビュー",
    "press_release": "プレスリリース",
    "csr_sustainability": "CSR/サステナビリティ",
    "midterm_plan": "中期経営計画",
    "structured": "構造化データ",
    "recruitment": "採用情報",
    "corporate_ir": "IR情報",
    "corporate_business": "事業情報",
    "corporate_general": "企業情報",
    "full_text": "フルテキスト",
}


def get_chroma_client() -> chromadb.PersistentClient:
    """Get or create ChromaDB client."""
    global _chroma_client
    if _chroma_client is None:
        # Ensure directory exists
        CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)

        _chroma_client = chromadb.PersistentClient(
            path=str(CHROMA_PERSIST_DIR),
            settings=ChromaSettings(
                anonymized_telemetry=False,
                allow_reset=True,
            )
        )
        print(f"[RAG保存] ✅ ChromaDB 初期化完了 ({CHROMA_PERSIST_DIR})")

    return _chroma_client


def _collection_name_for_backend(backend: EmbeddingBackend) -> str:
    safe_model = backend.model.replace("/", "_").replace(":", "_")
    return f"{COMPANY_COLLECTION}__{backend.provider}__{safe_model}"


def _collection_names_for_backend(backend: EmbeddingBackend) -> list[str]:
    names = [_collection_name_for_backend(backend)]
    if backend.provider == "openai" and backend.model == "text-embedding-3-small":
        names.append(LEGACY_COLLECTION_NAME)
    return names


def _get_collection(name: str, metadata: Optional[dict] = None) -> chromadb.Collection:
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=name,
        metadata=metadata or {"description": "Company recruitment information for RAG"},
    )


def get_company_collection(backend: EmbeddingBackend) -> chromadb.Collection:
    """Get or create company info collection for a specific embedding backend."""
    return _get_collection(
        name=_collection_name_for_backend(backend),
        metadata={
            "description": "Company recruitment information for RAG",
            "embedding_provider": backend.provider,
            "embedding_model": backend.model,
        },
    )


def _resolve_write_backend(backend: Optional[EmbeddingBackend]) -> Optional[EmbeddingBackend]:
    return backend or resolve_embedding_backend()


def _resolve_read_backends(backends: Optional[list[EmbeddingBackend]]) -> list[EmbeddingBackend]:
    if backends is not None:
        return [b for b in backends if b]
    available = get_available_backends()
    return available if available else []


def _context_dedupe_key(context: dict) -> tuple:
    meta = context.get("metadata") or {}
    return (
        meta.get("source_url"),
        meta.get("chunk_index"),
        meta.get("content_type") or meta.get("chunk_type"),
        context.get("text"),
    )


def _fallback_local_backend(current: EmbeddingBackend) -> Optional[EmbeddingBackend]:
    provider = (settings.embeddings_provider or "auto").strip().lower()
    if provider != "auto" or current.provider != "openai":
        return None
    return resolve_embedding_backend("local")


def get_dynamic_context_length(es_content: str) -> int:
    """Adjust RAG context length based on ES length."""
    char_count = len(es_content or "")
    if char_count < 500:
        return 1500
    if char_count < 1000:
        return 2500
    return 3000


async def store_company_info(
    company_id: str,
    company_name: str,
    content_chunks: list[dict],
    source_url: str,
    backend: Optional[EmbeddingBackend] = None,
    allow_fallback: bool = True
) -> bool:
    """
    Store company information in vector database.

    Args:
        company_id: Unique company identifier
        company_name: Company name
        content_chunks: List of content chunks with text and metadata
            Each chunk: {"text": str, "type": str, "metadata": dict}
        source_url: Source URL of the information

    Returns:
        True if successful, False otherwise
    """
    try:
        backend = _resolve_write_backend(backend)
        if backend is None:
            print("[RAG保存] ❌ 埋め込みバックエンドが利用できません")
            return False

        # Delete existing entries for this company across related collections
        for name in _collection_names_for_backend(backend):
            try:
                _get_collection(name).delete(where={"company_id": company_id})
            except Exception:
                pass  # Collection might not have existing entries

        collection = get_company_collection(backend)

        # Prepare documents and metadata
        documents = []
        metadatas = []
        ids = []

        for idx, chunk in enumerate(content_chunks):
            text = chunk.get("text", "")
            if not text or len(text.strip()) < 10:
                continue

            doc_id = f"{company_id}_{idx}"
            metadata = {
                "company_id": company_id,
                "company_name": company_name,
                "source_url": source_url,
                "chunk_type": chunk.get("type", "general"),
                "chunk_index": idx,
                "embedding_provider": backend.provider,
                "embedding_model": backend.model,
            }
            # Add any additional metadata from the chunk
            if chunk.get("metadata"):
                for key, value in chunk["metadata"].items():
                    if isinstance(value, (str, int, float, bool)):
                        metadata[key] = value

            documents.append(text)
            metadatas.append(metadata)
            ids.append(doc_id)

        if not documents:
            print(f"[RAG保存] ⚠️ 有効なチャンクなし (会社ID: {company_id[:8]}...)")
            return False

        # Generate embeddings
        embeddings = await generate_embeddings_batch(documents, backend=backend, allow_fallback=False)

        # Filter out failed embeddings
        valid_items = [
            (doc, meta, doc_id, emb)
            for doc, meta, doc_id, emb in zip(documents, metadatas, ids, embeddings)
            if emb is not None
        ]

        if not valid_items:
            print(f"[RAG保存] ❌ 埋め込み生成失敗 (会社ID: {company_id[:8]}...)")
            if allow_fallback:
                fallback_backend = _fallback_local_backend(backend)
                if fallback_backend:
                    print(f"[RAG保存] ⚠️ ローカル埋め込みにフォールバック")
                    return await store_company_info(
                        company_id=company_id,
                        company_name=company_name,
                        content_chunks=content_chunks,
                        source_url=source_url,
                        backend=fallback_backend,
                        allow_fallback=False
                    )
            return False

        # Unpack valid items
        valid_docs, valid_metas, valid_ids, valid_embs = zip(*valid_items)

        # Add to collection
        collection.add(
            documents=list(valid_docs),
            metadatas=list(valid_metas),
            ids=list(valid_ids),
            embeddings=list(valid_embs)
        )

        print(f"[RAG保存] ✅ {len(valid_docs)}チャンク保存完了 (会社ID: {company_id[:8]}...)")
        update_bm25_index(company_id)
        cache = get_rag_cache()
        if cache:
            await cache.invalidate_company(company_id)
        return True

    except Exception as e:
        print(f"[RAG保存] ❌ 企業情報保存エラー: {e}")
        return False


async def search_company_context(
    company_id: str,
    query: str,
    n_results: int = 5,
    backend: Optional[EmbeddingBackend] = None
) -> list[dict]:
    """
    Search for relevant company context based on query.

    Args:
        company_id: Company identifier to search within
        query: Search query (e.g., ES content)
        n_results: Maximum number of results to return

    Returns:
        List of relevant context chunks with metadata
    """
    try:
        backends = None if backend is None else [backend]
        return await search_company_context_by_type(
            company_id=company_id,
            query=query,
            n_results=n_results,
            content_types=None,
            backends=backends
        )
    except Exception as e:
        print(f"[RAG検索] ❌ 企業コンテキスト検索エラー: {e}")
        return []


async def get_company_context_for_review(
    company_id: str,
    es_content: str,
    max_context_length: int = 2000
) -> str:
    """
    Get formatted company context for ES review.

    Args:
        company_id: Company identifier
        es_content: ES content to find relevant context for
        max_context_length: Maximum length of returned context

    Returns:
        Formatted context string for LLM prompt
    """
    contexts = await search_company_context_by_type(
        company_id,
        es_content,
        content_types=CONTENT_TYPES_NEW + [STRUCTURED_CONTENT_TYPE] + LEGACY_CONTENT_TYPES,
    )

    if not contexts:
        return ""

    # Format context
    context_parts = []
    total_length = 0

    for ctx in contexts:
        text = ctx["text"]
        chunk_type = ctx["metadata"].get("chunk_type", "general")

        # Add type label
        type_labels = {
            "deadline": "締切情報",
            "recruitment_type": "募集区分",
            "required_documents": "提出物",
            "application_method": "応募方法",
            "selection_process": "選考プロセス",
            "general": "企業情報",
        }
        label = type_labels.get(chunk_type, "企業情報")

        formatted = f"【{label}】\n{text}"

        if total_length + len(formatted) > max_context_length:
            break

        context_parts.append(formatted)
        total_length += len(formatted)

    return "\n\n".join(context_parts)


def has_company_rag(company_id: str, backends: Optional[list[EmbeddingBackend]] = None) -> bool:
    """
    Check if company has RAG data stored.

    Args:
        company_id: Company identifier

    Returns:
        True if company has RAG data
    """
    try:
        read_backends = backends or get_configured_backends()
        for backend in read_backends:
            for name in _collection_names_for_backend(backend):
                collection = _get_collection(name)
                results = collection.get(
                    where={"company_id": company_id},
                    limit=1
                )
                if results["ids"]:
                    return True
        return False
    except Exception:
        return False


def delete_company_rag(company_id: str, backends: Optional[list[EmbeddingBackend]] = None) -> bool:
    """
    Delete company RAG data.

    Args:
        company_id: Company identifier

    Returns:
        True if successful
    """
    try:
        read_backends = backends or get_configured_backends()
        deleted_any = False
        for backend in read_backends:
            for name in _collection_names_for_backend(backend):
                collection = _get_collection(name)
                collection.delete(where={"company_id": company_id})
                deleted_any = True
        print(f"[RAG保存] ✅ RAGデータ削除完了 (会社ID: {company_id[:8]}...)")
        update_bm25_index(company_id)
        return deleted_any
    except Exception as e:
        print(f"[RAG保存] ❌ RAGデータ削除エラー: {e}")
        return False


# ============================================================
# Enhanced RAG Functions (Full Text & Content Type Support)
# ============================================================

# Valid content types (new + structured + legacy)
CONTENT_TYPES = CONTENT_TYPES_ALL


async def store_full_text_content(
    company_id: str,
    company_name: str,
    raw_text: str,
    source_url: str,
    content_type: Optional[str] = None,
    content_channel: Optional[str] = None,
    backend: Optional[EmbeddingBackend] = None,
    allow_fallback: bool = True,
    raw_format: str = "text"
) -> bool:
    """
    Store full text content from a web page in vector database.

    This chunks the text and stores it alongside structured data.

    Args:
        company_id: Unique company identifier
        company_name: Company name
        raw_text: Raw content (text or HTML)
        source_url: Source URL of the content
        content_type: New content classification (optional)
        content_channel: Legacy content channel (recruitment/corporate_ir/etc.)
        raw_format: "text" or "html"

    Returns:
        True if successful, False otherwise
    """
    from app.utils.text_chunker import (
        JapaneseTextChunker,
        extract_sections_from_html,
        chunk_sections_with_metadata,
        chunk_html_content,
    )

    if content_type in LEGACY_CONTENT_TYPES and not content_channel:
        content_channel = content_type
        content_type = None

    if content_type and content_type not in CONTENT_TYPES:
        print(f"[RAG保存] ⚠️ 無効なcontent_type: {content_type}")
        return False
    if content_channel and content_channel not in LEGACY_CONTENT_TYPES:
        print(f"[RAG保存] ⚠️ 無効なcontent_channel: {content_channel}")
        content_channel = None

    try:
        raw_format = (raw_format or "text").lower()
        if raw_format not in ("text", "html"):
            raw_format = "text"
        backend = _resolve_write_backend(backend)
        if backend is None:
            print("[RAG保存] ❌ フルテキスト保存用の埋め込みバックエンドなし")
            return False
        effective_type = content_type or normalize_content_type(content_channel or "corporate_site")
        chunk_size, chunk_overlap = get_chunk_settings(effective_type)

        # Chunk the content (HTML-aware when possible)
        chunks = []
        if raw_format == "html":
            sections = extract_sections_from_html(raw_text)
            if sections:
                chunks = chunk_sections_with_metadata(
                    sections,
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap
                )
            if not chunks:
                chunks = chunk_html_content(raw_text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        else:
            chunker = JapaneseTextChunker(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap
            )
            chunks = chunker.chunk_with_metadata(raw_text)

        if not chunks:
            print(f"[RAG保存] ⚠️ チャンク生成なし (会社ID: {company_id[:8]}...)")
            return False

        # Add content_type and timestamp to each chunk's metadata
        now = datetime.utcnow().isoformat()
        for chunk in chunks:
            if "metadata" not in chunk or chunk["metadata"] is None:
                chunk["metadata"] = {}
            chunk["metadata"]["source_url"] = source_url
            chunk["metadata"]["content_type"] = content_type
            chunk["metadata"]["fetched_at"] = now

        # Classify chunks (rule + LLM fallback)
        classified = await classify_chunks(
            chunks,
            source_channel=content_channel,
            fallback_type=content_type
        )

        # Group by classified content_type
        grouped: dict[str, list[dict]] = {}
        for chunk in classified:
            meta = chunk.get("metadata") or {}
            ct = meta.get("content_type") or content_type or normalize_content_type(content_channel or "corporate_site")
            if ct == STRUCTURED_CONTENT_TYPE:
                ct = normalize_content_type(content_channel or "corporate_site")
            grouped.setdefault(ct, []).append(chunk)

        any_success = False
        for ct, group_chunks in grouped.items():
            # Store per content type (deletes existing of that type)
            success = await _store_content_by_type(
                company_id=company_id,
                company_name=company_name,
                content_chunks=group_chunks,
                source_url=source_url,
                content_type=ct,
                backend=backend,
                allow_fallback=allow_fallback
            )
            any_success = any_success or success

        if any_success:
            update_bm25_index(company_id)
            cache = get_rag_cache()
            if cache:
                await cache.invalidate_company(company_id)

        return any_success

    except Exception as e:
        print(f"[RAG保存] ❌ フルテキスト保存エラー: {e}")
        return False


async def _store_content_by_type(
    company_id: str,
    company_name: str,
    content_chunks: list[dict],
    source_url: str,
    content_type: str,
    backend: EmbeddingBackend,
    allow_fallback: bool = True
) -> bool:
    """
    Store content chunks by content type.

    This deletes existing content of the same type before storing new content,
    preserving content of other types.

    Args:
        company_id: Company identifier
        company_name: Company name
        content_chunks: List of content chunks
        source_url: Source URL
        content_type: Content type to store

    Returns:
        True if successful
    """
    try:
        collection = get_company_collection(backend)

        # Delete existing content of this type only across related collections
        for name in _collection_names_for_backend(backend):
            try:
                _get_collection(name).delete(where={
                    "$and": [
                        {"company_id": company_id},
                        {"content_type": content_type}
                    ]
                })
            except Exception:
                pass  # May fail if no existing entries

        # Prepare documents
        documents = []
        metadatas = []
        ids = []

        for idx, chunk in enumerate(content_chunks):
            text = chunk.get("text", "")
            if not text or len(text.strip()) < 10:
                continue

            # Create unique ID including content type
            doc_id = f"{company_id}_{content_type}_{idx}"

            metadata = {
                "company_id": company_id,
                "company_name": company_name,
                "source_url": source_url,
                "chunk_type": chunk.get("type", "full_text"),
                "content_type": content_type,
                "chunk_index": idx,
                "embedding_provider": backend.provider,
                "embedding_model": backend.model,
            }

            # Add any additional metadata from the chunk
            if chunk.get("metadata"):
                for key, value in chunk["metadata"].items():
                    if isinstance(value, (str, int, float, bool)):
                        metadata[key] = value

            documents.append(text)
            metadatas.append(metadata)
            ids.append(doc_id)

        if not documents:
            ct_ja = CONTENT_TYPE_JA.get(content_type, content_type)
            print(f"[RAG保存] ⚠️ 有効なチャンクなし: {ct_ja} (会社ID: {company_id[:8]}...)")
            return False

        # Generate embeddings
        embeddings = await generate_embeddings_batch(documents, backend=backend, allow_fallback=False)

        # Filter out failed embeddings
        valid_items = [
            (doc, meta, doc_id, emb)
            for doc, meta, doc_id, emb in zip(documents, metadatas, ids, embeddings)
            if emb is not None
        ]

        if not valid_items:
            print(f"[RAG保存] ❌ 埋め込み生成失敗 (会社ID: {company_id[:8]}...)")
            if allow_fallback:
                fallback_backend = _fallback_local_backend(backend)
                if fallback_backend:
                    print(f"[RAG保存] ⚠️ ローカル埋め込みにフォールバック")
                    return await _store_content_by_type(
                        company_id=company_id,
                        company_name=company_name,
                        content_chunks=content_chunks,
                        source_url=source_url,
                        content_type=content_type,
                        backend=fallback_backend,
                        allow_fallback=False
                    )
            return False

        valid_docs, valid_metas, valid_ids, valid_embs = zip(*valid_items)

        # Add to collection
        collection.add(
            documents=list(valid_docs),
            metadatas=list(valid_metas),
            ids=list(valid_ids),
            embeddings=list(valid_embs)
        )

        ct_ja = CONTENT_TYPE_JA.get(content_type, content_type)
        print(f"[RAG保存] ✅ {ct_ja} {len(valid_docs)}チャンク保存完了 (会社ID: {company_id[:8]}...)")

        return True

    except Exception as e:
        print(f"[RAG保存] ❌ コンテンツタイプ別保存エラー: {e}")
        return False


async def search_company_context_by_type(
    company_id: str,
    query: str,
    n_results: int = 5,
    content_types: Optional[list[str]] = None,
    backends: Optional[list[EmbeddingBackend]] = None,
    include_embeddings: bool = False
) -> list[dict]:
    """
    Search for relevant company context with content type filtering.

    Args:
        company_id: Company identifier
        query: Search query
        n_results: Maximum results to return
        content_types: List of content types to include (None = all)
        include_embeddings: Include embeddings in results (for MMR)

    Returns:
        List of relevant context chunks with metadata
    """
    try:
        search_backends = _resolve_read_backends(backends)
        if not search_backends:
            print("[RAG検索] ⚠️ 検索用の埋め込みバックエンドなし")
            return []

        # Build where clause
        if content_types:
            expanded_types = expand_content_type_filter(content_types)
            where_clause = {
                "$and": [
                    {"company_id": company_id},
                    {"content_type": {"$in": expanded_types}}
                ]
            }
        else:
            where_clause = {"company_id": company_id}

        all_contexts: list[dict] = []

        for backend in search_backends:
            query_embedding = await generate_embedding(query, backend=backend)
            if query_embedding is None:
                continue

            for name in _collection_names_for_backend(backend):
                collection = _get_collection(name)
                include = ["documents", "metadatas", "distances"]
                if include_embeddings:
                    include.append("embeddings")
                results = collection.query(
                    query_embeddings=[query_embedding],
                    where=where_clause,
                    n_results=n_results,
                    include=include
                )

                if results["documents"] and results["documents"][0]:
                    for idx, doc in enumerate(results["documents"][0]):
                        embedding = None
                        if include_embeddings and results.get("embeddings"):
                            try:
                                embedding = results["embeddings"][0][idx]
                            except Exception:
                                embedding = None
                        all_contexts.append({
                            "text": doc,
                            "metadata": results["metadatas"][0][idx] if results["metadatas"] else {},
                            "distance": results["distances"][0][idx] if results["distances"] else None,
                            "id": results["ids"][0][idx] if results["ids"] else None,
                            "embedding": embedding,
                            "embedding_provider": backend.provider,
                            "embedding_model": backend.model,
                            "collection": name,
                        })

        if not all_contexts:
            return []

        def distance_score(ctx: dict) -> float:
            return ctx.get("distance") if ctx.get("distance") is not None else float("inf")

        deduped: dict[tuple, dict] = {}
        for ctx in all_contexts:
            key = _context_dedupe_key(ctx)
            existing = deduped.get(key)
            if existing is None or distance_score(ctx) < distance_score(existing):
                deduped[key] = ctx

        ordered = sorted(deduped.values(), key=distance_score)
        return ordered[:n_results]

    except Exception as e:
        print(f"[RAG検索] ❌ タイプ別検索エラー: {e}")
        return []


def get_company_rag_status(company_id: str, backends: Optional[list[EmbeddingBackend]] = None) -> dict:
    """
    Get detailed RAG status for a company.

    Args:
        company_id: Company identifier

    Returns:
        Dict with RAG status details
    """
    try:
        read_backends = backends or get_configured_backends()
        counts_new = {key: 0 for key in CONTENT_TYPES_NEW}
        counts_new[STRUCTURED_CONTENT_TYPE] = 0
        counts_legacy = {
            "recruitment": 0,
            "corporate_ir": 0,
            "corporate_business": 0,
            "corporate_general": 0,
        }

        last_updated = None
        total_chunks = 0

        for backend in read_backends:
            for name in _collection_names_for_backend(backend):
                collection = _get_collection(name)
                results = collection.get(
                    where={"company_id": company_id},
                    include=["metadatas"]
                )

                ids = results.get("ids") or []
                total_chunks += len(ids)

                for meta in results.get("metadatas") or []:
                    content_type = meta.get("content_type", STRUCTURED_CONTENT_TYPE)
                    normalized = normalize_content_type(content_type)
                    if normalized in counts_new:
                        counts_new[normalized] += 1
                    else:
                        counts_new[STRUCTURED_CONTENT_TYPE] += 1

                    channel = meta.get("content_channel")
                    if channel in counts_legacy:
                        counts_legacy[channel] += 1
                    else:
                        legacy_fallbacks = NEW_TO_LEGACY.get(normalized, [])
                        for legacy in legacy_fallbacks:
                            if legacy in counts_legacy:
                                counts_legacy[legacy] += 1

                    fetched_at = meta.get("fetched_at")
                    if fetched_at:
                        if last_updated is None or fetched_at > last_updated:
                            last_updated = fetched_at

        if total_chunks == 0:
            return {
                "has_rag": False,
                "total_chunks": 0,
                "recruitment_chunks": 0,
                "corporate_ir_chunks": 0,
                "corporate_business_chunks": 0,
                "corporate_general_chunks": 0,
                "structured_chunks": 0,
                # New content types (9 categories)
                "new_grad_recruitment_chunks": 0,
                "midcareer_recruitment_chunks": 0,
                "corporate_site_chunks": 0,
                "ir_materials_chunks": 0,
                "ceo_message_chunks": 0,
                "employee_interviews_chunks": 0,
                "press_release_chunks": 0,
                "csr_sustainability_chunks": 0,
                "midterm_plan_chunks": 0,
                # Legacy recruitment_homepage (for backward compatibility)
                "recruitment_homepage_chunks": 0,
                "last_updated": None
            }

        return {
            "has_rag": True,
            "total_chunks": total_chunks,
            "recruitment_chunks": counts_legacy["recruitment"],
            "corporate_ir_chunks": counts_legacy["corporate_ir"],
            "corporate_business_chunks": counts_legacy["corporate_business"],
            "corporate_general_chunks": counts_legacy["corporate_general"],
            "structured_chunks": counts_new[STRUCTURED_CONTENT_TYPE],
            # New content types (9 categories)
            "new_grad_recruitment_chunks": counts_new.get("new_grad_recruitment", 0),
            "midcareer_recruitment_chunks": counts_new.get("midcareer_recruitment", 0),
            "corporate_site_chunks": counts_new.get("corporate_site", 0),
            "ir_materials_chunks": counts_new.get("ir_materials", 0),
            "ceo_message_chunks": counts_new.get("ceo_message", 0),
            "employee_interviews_chunks": counts_new.get("employee_interviews", 0),
            "press_release_chunks": counts_new.get("press_release", 0),
            "csr_sustainability_chunks": counts_new.get("csr_sustainability", 0),
            "midterm_plan_chunks": counts_new.get("midterm_plan", 0),
            # Legacy recruitment_homepage (for backward compatibility - includes any unmigrated data)
            "recruitment_homepage_chunks": counts_new.get("recruitment_homepage", 0),
            "last_updated": last_updated
        }

    except Exception as e:
        print(f"[RAG] ❌ ステータス取得エラー: {e}")
        return {
            "has_rag": False,
            "total_chunks": 0,
            "recruitment_chunks": 0,
            "corporate_ir_chunks": 0,
            "corporate_business_chunks": 0,
            "corporate_general_chunks": 0,
            "structured_chunks": 0,
            "new_grad_recruitment_chunks": 0,
            "midcareer_recruitment_chunks": 0,
            "corporate_site_chunks": 0,
            "ir_materials_chunks": 0,
            "ceo_message_chunks": 0,
            "employee_interviews_chunks": 0,
            "press_release_chunks": 0,
            "csr_sustainability_chunks": 0,
            "midterm_plan_chunks": 0,
            "recruitment_homepage_chunks": 0,
            "last_updated": None
        }


def delete_company_rag_by_type(
    company_id: str,
    content_type: str,
    backends: Optional[list[EmbeddingBackend]] = None
) -> bool:
    """
    Delete company RAG data for a specific content type.

    Args:
        company_id: Company identifier
        content_type: Content type to delete

    Returns:
        True if successful
    """
    try:
        read_backends = backends or get_configured_backends()
        deleted_any = False
        for backend in read_backends:
            for name in _collection_names_for_backend(backend):
                collection = _get_collection(name)
                collection.delete(where={
                    "$and": [
                        {"company_id": company_id},
                        {"content_type": content_type}
                    ]
                })
                deleted_any = True
        ct_ja = CONTENT_TYPE_JA.get(content_type, content_type)
        print(f"[RAG保存] ✅ {ct_ja} RAGデータ削除完了 (会社ID: {company_id[:8]}...)")
        update_bm25_index(company_id)
        return deleted_any
    except Exception as e:
        print(f"[RAG保存] ❌ タイプ別RAGデータ削除エラー: {e}")
        return False


def delete_company_rag_by_urls(
    company_id: str,
    source_urls: list[str],
    backends: Optional[list[EmbeddingBackend]] = None
) -> dict[str, int]:
    """
    Delete company RAG data for specific source URLs.

    Args:
        company_id: Company identifier
        source_urls: List of source URLs to delete

    Returns:
        Dict with:
        - total_deleted: Total chunks deleted
        - per_url: Dict mapping URL to deleted count
    """
    result = {
        "total_deleted": 0,
        "per_url": {}
    }

    if not source_urls:
        return result

    try:
        read_backends = backends or get_configured_backends()

        for url in source_urls:
            url_deleted = 0

            for backend in read_backends:
                for name in _collection_names_for_backend(backend):
                    collection = _get_collection(name)

                    # Get count before deletion
                    existing = collection.get(
                        where={
                            "$and": [
                                {"company_id": company_id},
                                {"source_url": url}
                            ]
                        },
                        include=[]
                    )
                    count_before = len(existing.get("ids") or [])

                    if count_before > 0:
                        # Delete chunks for this URL
                        collection.delete(where={
                            "$and": [
                                {"company_id": company_id},
                                {"source_url": url}
                            ]
                        })
                        url_deleted += count_before

            result["per_url"][url] = url_deleted
            result["total_deleted"] += url_deleted

        print(f"[RAG保存] ✅ URL別RAGデータ削除完了: {result['total_deleted']}チャンク (会社ID: {company_id[:8]}...)")
        update_bm25_index(company_id)
        return result

    except Exception as e:
        print(f"[RAG保存] ❌ URL別RAGデータ削除エラー: {e}")
        return result


# ============================================================
# BM25 Index Integration
# ============================================================


def update_bm25_index(company_id: str) -> bool:
    """
    Update BM25 index from ChromaDB data.

    This rebuilds the BM25 index for a company using all documents
    stored in ChromaDB.

    Args:
        company_id: Company identifier

    Returns:
        True if successful
    """
    try:
        from app.utils.bm25_store import get_or_create_index, clear_index_cache, BM25Index
    except Exception as e:
        print(f"[BM25] ⚠️ bm25s未設定のためスキップ: {e}")
        return False

    try:
        read_backends = get_configured_backends()
        documents: list[dict] = []

        for backend in read_backends:
            for name in _collection_names_for_backend(backend):
                collection = _get_collection(name)
                results = collection.get(
                    where={"company_id": company_id},
                    include=["documents", "metadatas"]  # "ids" is always returned by ChromaDB
                )

                docs = results.get("documents") or []
                metas = results.get("metadatas") or []
                ids = results.get("ids") or []

                for doc, meta, doc_id in zip(docs, metas, ids):
                    if not doc:
                        continue
                    metadata = meta or {}
                    documents.append({
                        "id": doc_id,
                        "text": doc,
                        "metadata": metadata
                    })

        if not documents:
            BM25Index.delete(company_id)
            clear_index_cache(company_id)
            print(f"[BM25] ℹ️ {company_id[:8]} のBM25インデックスを削除")
            return False

        # Deduplicate
        deduped: dict[tuple, dict] = {}
        for doc in documents:
            key = _context_dedupe_key({
                "text": doc.get("text"),
                "metadata": doc.get("metadata")
            })
            if key not in deduped:
                deduped[key] = doc

        index = get_or_create_index(company_id)
        index.clear()
        index.add_documents(list(deduped.values()))
        index.save()
        clear_index_cache(company_id)
        print(f"[BM25] ✅ {company_id[:8]} のBM25インデックス更新完了 ({len(deduped)} docs)")
        return True

    except Exception as e:
        print(f"[BM25] ❌ インデックス更新失敗: {e}")
        return False


async def hybrid_search_company_context(
    company_id: str,
    query: str,
    n_results: int = 10,
    content_types: Optional[list[str]] = None,
    semantic_weight: float = 0.6,
    keyword_weight: float = 0.4,
    backends: Optional[list[EmbeddingBackend]] = None
) -> list[dict]:
    """
    Perform hybrid search combining semantic and keyword search.

    Args:
        company_id: Company to search within
        query: Search query (e.g., ES content)
        n_results: Maximum number of results
        content_types: Filter by content types
        semantic_weight: Weight for semantic search (default 0.6)
        keyword_weight: Weight for keyword search (default 0.4)

    Returns:
        List of context dicts with text, metadata, and scores
    """
    from app.utils.hybrid_search import hybrid_search

    return await hybrid_search(
        company_id=company_id,
        query=query,
        n_results=n_results,
        content_types=content_types,
        semantic_weight=semantic_weight,
        keyword_weight=keyword_weight,
        use_rrf=True,  # Use RRF for combining
        backends=backends
    )


async def hybrid_search_company_context_enhanced(
    company_id: str,
    query: str,
    n_results: int = 10,
    content_types: Optional[list[str]] = None,
    semantic_weight: float = 0.6,
    keyword_weight: float = 0.4,
    backends: Optional[list[EmbeddingBackend]] = None,
    expand_queries: bool = True,
    rerank: bool = True
) -> list[dict]:
    """
    Enhanced dense search with query expansion, HyDE, MMR, and LLM reranking.
    """
    from app.utils.hybrid_search import dense_hybrid_search

    return await dense_hybrid_search(
        company_id=company_id,
        query=query,
        n_results=n_results,
        content_types=content_types,
        backends=backends,
        expand_queries=expand_queries,
        use_hyde=True,
        rerank=rerank,
        use_mmr=True,
        semantic_weight=semantic_weight,
        keyword_weight=keyword_weight,
        use_bm25=True,
    )


async def get_enhanced_context_for_review(
    company_id: str,
    es_content: str,
    max_context_length: Optional[int] = None
) -> str:
    """
    Get enhanced context for ES review using hybrid search.

    This provides richer context by:
    1. Using dense-only search with query expansion and HyDE
    2. Applying MMR for diversity and LLM reranking
    3. Including both structured data and full text content
    4. Organizing context by content type

    Args:
        company_id: Company identifier
        es_content: ES content to find relevant context for
        max_context_length: Maximum context length

    Returns:
        Formatted context string for LLM prompt
    """
    from app.utils.hybrid_search import get_context_for_review_hybrid

    if max_context_length is None:
        max_context_length = get_dynamic_context_length(es_content)

    cache = get_rag_cache()
    cache_key = build_cache_key("enhanced_context", company_id, es_content, str(max_context_length))
    if cache:
        cached = await cache.get_context(company_id, cache_key)
        if isinstance(cached, dict) and isinstance(cached.get("context"), str):
            return cached["context"]

    # Get enhanced dense search results (multi-query + HyDE + rerank)
    results = await hybrid_search_company_context_enhanced(
        company_id=company_id,
        query=es_content,
        n_results=15,  # Get more for better coverage
        content_types=None,  # Include all types
        semantic_weight=0.6,
        keyword_weight=0.4
    )

    if not results:
        # Fallback to original function
        context = await get_company_context_for_review(
            company_id=company_id,
            es_content=es_content,
            max_context_length=max_context_length
        )
        if cache:
            await cache.set_context(company_id, cache_key, {"context": context})
        return context

    context = get_context_for_review_hybrid(results, max_context_length)
    if cache:
        await cache.set_context(company_id, cache_key, {"context": context})
    return context


async def get_enhanced_context_for_review_with_sources(
    company_id: str,
    es_content: str,
    max_context_length: Optional[int] = None
) -> tuple[str, list[dict]]:
    """
    Get enhanced context for ES review using dense search, with source tracking.

    This provides richer context by:
    1. Using dense-only search with query expansion and HyDE
    2. Applying MMR for diversity and LLM reranking
    3. Including both structured data and full text content
    4. Organizing context by content type
    5. Returning source URLs for attribution

    Args:
        company_id: Company identifier
        es_content: ES content to find relevant context for
        max_context_length: Maximum context length

    Returns:
        Tuple of:
        - context_text: Formatted context string for LLM prompt
        - sources: List of source dicts with source_id, source_url, content_type, excerpt
    """
    from app.utils.hybrid_search import get_context_and_sources_for_review_hybrid

    if max_context_length is None:
        max_context_length = get_dynamic_context_length(es_content)

    cache = get_rag_cache()
    cache_key = build_cache_key("enhanced_context_sources", company_id, es_content, str(max_context_length))
    if cache:
        cached = await cache.get_context(company_id, cache_key)
        if isinstance(cached, dict) and isinstance(cached.get("context"), str) and isinstance(cached.get("sources"), list):
            return cached["context"], cached["sources"]

    # Get enhanced dense search results (multi-query + HyDE + rerank)
    results = await hybrid_search_company_context_enhanced(
        company_id=company_id,
        query=es_content,
        n_results=15,  # Get more for better coverage
        content_types=None,  # Include all types
        semantic_weight=0.6,
        keyword_weight=0.4
    )

    if not results:
        # Fallback: return empty sources
        context = await get_company_context_for_review(
            company_id=company_id,
            es_content=es_content,
            max_context_length=max_context_length
        )
        if cache:
            await cache.set_context(company_id, cache_key, {"context": context, "sources": []})
        return context, []

    context, sources = get_context_and_sources_for_review_hybrid(results, max_context_length)
    if cache:
        await cache.set_context(company_id, cache_key, {"context": context, "sources": sources})
    return context, sources
