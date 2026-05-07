from __future__ import annotations

import pytest

from app.rag import vector_store


def test_validate_rag_source_metadata_requires_consent_for_private_material() -> None:
    with pytest.raises(ValueError):
        vector_store.validate_rag_source_metadata(
            source_kind="private_user_material",
            tenant_key="tenant",
            company_id="company-1",
            source_id="source-1",
            consent_reference=None,
        )


def test_validate_rag_source_metadata_tracks_private_source_contract() -> None:
    metadata = vector_store.validate_rag_source_metadata(
        source_kind="private_user_material",
        tenant_key="tenant",
        company_id="company-1",
        source_id="source-1",
        consent_reference="consent-1",
    )

    assert metadata == {
        "source_kind": "private_user_material",
        "tenant_key": "tenant",
        "company_id": "company-1",
        "source_id": "source-1",
        "consent_reference": "consent-1",
    }


def test_validate_rag_source_metadata_preserves_public_legacy_callers() -> None:
    metadata = vector_store.validate_rag_source_metadata(
        source_kind="crawl",
        tenant_key="tenant",
        company_id="company-1",
        source_id="https://example.com/recruit",
    )

    assert metadata["source_kind"] == "corporate_public"
    assert metadata["consent_reference"] == ""
