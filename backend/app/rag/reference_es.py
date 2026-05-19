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
    ingest_session_id: str = ""
    anonymization_level: str = "synthetic"
    source_provenance: str = ""
    usage_consent: bool = False


def reference_collection_name(backend: EmbeddingBackend) -> str:
    return collection_name_for_backend(
        REFERENCE_ES_COLLECTION_PREFIX,
        provider=backend.provider,
        model=backend.model,
    )


def _and_where(*clauses: dict) -> dict:
    non_empty = [clause for clause in clauses if clause]
    if not non_empty:
        return {}
    if len(non_empty) == 1:
        return non_empty[0]
    return {"$and": non_empty}


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
                "anonymization_level": record.anonymization_level,
                "source_provenance": record.source_provenance,
                "usage_consent": record.usage_consent,
                "ingest_session_id": record.ingest_session_id,
                "source_version": record.source_version,
            }
        )
    if not ids:
        return 0
    collection.upsert(ids=ids, documents=docs, embeddings=vectors, metadatas=metadatas)
    return len(ids)
