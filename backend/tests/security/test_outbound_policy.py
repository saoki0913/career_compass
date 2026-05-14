from __future__ import annotations

from app.privacy.outbound_policy import prepare_outbound_text


def test_prepare_outbound_text_redacts_direct_identifiers() -> None:
    result = prepare_outbound_text(
        "連絡先 student@example.com / 090-1234-5678 / Bearer abcdefghijklmnopqrstuvwxyz",
        purpose="retrieval_query",
    )

    assert result.redaction_applied is True
    assert "student@example.com" not in result.text
    assert "090-1234-5678" not in result.text
    assert "abcdefghijklmnopqrstuvwxyz" not in result.text


def test_prepare_outbound_text_applies_purpose_limit() -> None:
    result = prepare_outbound_text("x" * 1000, purpose="query_expansion")

    assert result.truncated is True
    assert len(result.text) == 400
    assert result.retention == "ephemeral"
