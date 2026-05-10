"""Deletion helpers for company RAG vector records."""

from typing import Optional


def extract_ids_to_delete_for_source(
    results: dict,
    current_ingest_session_id: Optional[str] = None,
) -> list[str]:
    ids = results.get("ids") or []
    metadatas = results.get("metadatas") or []
    deletable_ids: list[str] = []

    for doc_id, metadata in zip(ids, metadatas):
        ingest_session_id = (
            metadata.get("ingest_session_id")
            if isinstance(metadata, dict)
            else None
        )
        if current_ingest_session_id and ingest_session_id == current_ingest_session_id:
            continue
        deletable_ids.append(doc_id)

    if len(ids) > len(metadatas):
        deletable_ids.extend(ids[len(metadatas):])

    return deletable_ids
