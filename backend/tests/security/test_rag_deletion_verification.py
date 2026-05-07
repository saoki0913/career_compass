from __future__ import annotations

from app.rag.vector_store import RagDeletionVerification, verify_rag_deletion_complete


def test_verify_rag_deletion_complete_reports_all_backends_clear() -> None:
    result = verify_rag_deletion_complete(
        chroma_remaining=0,
        bm25_remaining=0,
        redis_remaining=0,
        supabase_object_remaining=0,
        ingest_job_remaining=0,
    )

    assert result.complete is True
    assert result.residuals == {}


def test_verify_rag_deletion_complete_reports_residuals() -> None:
    result = verify_rag_deletion_complete(
        chroma_remaining=1,
        bm25_remaining=0,
        redis_remaining=2,
        supabase_object_remaining=0,
        ingest_job_remaining=1,
    )

    assert isinstance(result, RagDeletionVerification)
    assert result.complete is False
    assert result.residuals == {
        "chroma": 1,
        "redis": 2,
        "ingest_job": 1,
    }
