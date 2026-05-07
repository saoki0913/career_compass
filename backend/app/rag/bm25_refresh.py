"""BM25 refresh service for company RAG.

The vector store owns Chroma collections; this module owns rebuilding the
keyword index from those collections so retrieval code does not import the
vector-store facade directly.
"""

from __future__ import annotations

from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


def update_bm25_index(company_id: str, tenant_key: str) -> bool:
    """Rebuild a company's BM25 index from ChromaDB data."""

    try:
        from app.utils.bm25_store import (
            BM25Index,
            clear_index_cache,
            get_or_create_index,
        )
    except Exception as e:
        logger.warning("bm25s not configured, skipping BM25 update: %s", e)
        return False

    try:
        from app.rag import vector_store

        read_backends = vector_store.get_configured_backends()
        documents: list[dict] = []
        where = vector_store._company_where(company_id, tenant_key)

        for backend in read_backends:
            for name in vector_store._collection_names_for_backend(backend):
                collection = vector_store._get_collection(name)
                results = collection.get(
                    where=where,
                    include=["documents", "metadatas"],
                )

                docs = results.get("documents") or []
                metas = results.get("metadatas") or []
                ids = results.get("ids") or []

                for doc, meta, doc_id in zip(docs, metas, ids):
                    if not doc:
                        continue
                    documents.append({
                        "id": doc_id,
                        "text": doc,
                        "metadata": meta or {},
                    })

        if not documents:
            BM25Index.delete(company_id, tenant_key=tenant_key)
            clear_index_cache(company_id, tenant_key=tenant_key)
            logger.debug("BM25 index deleted for company_id: %s...", company_id[:8])
            return False

        deduped: dict[tuple, dict] = {}
        for doc in documents:
            key = vector_store._context_dedupe_key(
                {"text": doc.get("text"), "metadata": doc.get("metadata")}
            )
            if key not in deduped:
                deduped[key] = doc

        index = get_or_create_index(company_id, tenant_key=tenant_key)
        index.clear()
        index.add_documents(list(deduped.values()))
        index.save()
        clear_index_cache(company_id, tenant_key=tenant_key)
        logger.info(
            "BM25 index updated for company_id: %s... (%d docs)",
            company_id[:8],
            len(deduped),
        )
        return True
    except Exception as e:
        logger.error("update_bm25_index error: %s", e, exc_info=True)
        return False
