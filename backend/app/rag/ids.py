from __future__ import annotations

import hashlib


def safe_model_name(model: str) -> str:
    return (model or "unknown").replace("/", "_").replace(":", "_")


def collection_name_for_backend(prefix: str, *, provider: str, model: str, contextual: bool = False) -> str:
    suffix = "__ctx" if contextual else ""
    return f"{prefix}__{provider}__{safe_model_name(model)}{suffix}"


def make_source_hash(source_url: str) -> str:
    normalized = (source_url or "").strip().encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()[:16]


def make_source_document_id(
    tenant_key: str,
    company_id: str,
    source_url: str,
    content_type: str,
    chunk_index: int,
    ingest_session_id: str,
) -> str:
    source_hash = make_source_hash(source_url)
    return f"{tenant_key}_{company_id}_{source_hash}_{content_type}_{chunk_index}_{ingest_session_id}"
