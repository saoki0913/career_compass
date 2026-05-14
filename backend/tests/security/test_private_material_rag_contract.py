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


def test_validate_rag_source_metadata_requires_privacy_contract_for_private_material() -> None:
    with pytest.raises(ValueError):
        vector_store.validate_rag_source_metadata(
            source_kind="private_user_material",
            tenant_key="tenant",
            company_id="company-1",
            source_id="source-1",
            consent_reference="consent-1",
        )


def test_validate_rag_source_metadata_tracks_private_source_contract() -> None:
    metadata = vector_store.validate_rag_source_metadata(
        source_kind="private_user_material",
        tenant_key="tenant",
        company_id="company-1",
        source_id="source-1",
        consent_reference="consent-1",
        pii_redaction_status="direct_identifiers_redacted",
        retention_until="2026-12-31",
        provider_policy="explicit_consent_required",
    )

    assert metadata == {
        "source_kind": "private_user_material",
        "tenant_key": "tenant",
        "company_id": "company-1",
        "source_id": "source-1",
        "consent_reference": "consent-1",
        "pii_redaction_status": "direct_identifiers_redacted",
        "retention_until": "2026-12-31",
        "provider_policy": "explicit_consent_required",
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
    assert metadata["pii_redaction_status"] == ""
