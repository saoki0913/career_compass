from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.rag.ids import collection_name_for_backend, make_source_hash
from app.utils.embeddings import EmbeddingBackend, generate_embeddings_batch, resolve_embedding_backend
from app.rag.vector_store import _get_collection

REFERENCE_ES_COLLECTION_PREFIX = "reference_es"


@dataclass(frozen=True)
class ReferenceEsRecord:
    es_id: str
    text: str
    question_type: str
    industry: str | None = None
    char_max: int | None = None
    source_version: str = "v1"


def reference_collection_name(backend: EmbeddingBackend) -> str:
    return collection_name_for_backend(
        REFERENCE_ES_COLLECTION_PREFIX,
        provider=backend.provider,
        model=backend.model,
    )


async def ingest_reference_es(
    records: list[ReferenceEsRecord],
    *,
    backend: Optional[EmbeddingBackend] = None,
) -> int:
    backend = backend or resolve_embedding_backend()
    if backend is None or not records:
        return 0
    texts = [record.text for record in records]
    embeddings = await generate_embeddings_batch(texts, backend=backend)
    collection = _get_collection(
        reference_collection_name(backend),
        metadata={
            "description": "Anonymized internal reference ES examples",
            "embedding_provider": backend.provider,
            "embedding_model": backend.model,
        },
    )
    ids: list[str] = []
    docs: list[str] = []
    vectors: list[list[float]] = []
    metadatas: list[dict] = []
    for record, embedding in zip(records, embeddings):
        if embedding is None:
            continue
        source_hash = make_source_hash(f"{record.source_version}:{record.es_id}:{record.text}")
        ids.append(f"reference_es_{record.es_id}_{source_hash}")
        docs.append(record.text)
        vectors.append(embedding)
        metadatas.append(
            {
                "question_type": record.question_type,
                "industry": record.industry or "",
                "es_id": record.es_id,
                "chunk_index": 0,
                "char_max": record.char_max or 0,
                "source_hash": source_hash,
                "anonymized": True,
                "source_version": record.source_version,
            }
        )
    if not ids:
        return 0
    collection.upsert(ids=ids, documents=docs, embeddings=vectors, metadatas=metadatas)
    return len(ids)


async def retrieve_reference_es_semantic(
    question_type: str,
    *,
    industry: str | None,
    char_max: int | None,
    query_text: str,
    top_k: int = 5,
    backend: Optional[EmbeddingBackend] = None,
) -> list[dict]:
    backend = backend or resolve_embedding_backend()
    if backend is None:
        return []
    query_embeddings = await generate_embeddings_batch([query_text], backend=backend)
    query_embedding = query_embeddings[0] if query_embeddings else None
    if query_embedding is None:
        return []
    collection = _get_collection(reference_collection_name(backend))
    where: dict = {"question_type": question_type, "anonymized": True}
    if industry:
        where = {"$and": [where, {"industry": industry}]}
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=max(1, top_k),
        where=where,
        include=["documents", "metadatas", "distances"],
    )
    documents = (results.get("documents") or [[]])[0]
    metadatas = (results.get("metadatas") or [[]])[0]
    distances = (results.get("distances") or [[]])[0]
    items: list[dict] = []
    for document, metadata, distance in zip(documents, metadatas, distances):
        if char_max and isinstance(metadata, dict):
            meta_char_max = int(metadata.get("char_max") or 0)
            if meta_char_max and meta_char_max > char_max:
                continue
        items.append({"text": document, "metadata": metadata or {}, "distance": distance})
    return items[:top_k]
