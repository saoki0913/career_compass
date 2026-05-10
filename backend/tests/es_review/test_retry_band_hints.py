"""Tests for retry band hint wording (small/tiny shortfalls)."""

from __future__ import annotations

from app.services.es_review.retry import _retry_hints_from_codes


def test_small_shortfall_hint_uses_concrete_expansion_guidance() -> None:
    hints = _retry_hints_from_codes(
        retry_code="under_min",
        failure_codes=["under_min"],
        char_min=200,
        char_max=300,
        current_length=182,
        length_control_mode="default",
        template_type="gakuchika",
    )
    assert len(hints) >= 1
    assert "修飾句" in hints[0]
    assert "対象" in hints[0] or "手段" in hints[0] or "結果" in hints[0]


def test_tiny_shortfall_hint_uses_concrete_expansion_guidance() -> None:
    hints = _retry_hints_from_codes(
        retry_code="under_min",
        failure_codes=["under_min"],
        char_min=200,
        char_max=300,
        current_length=192,
        length_control_mode="default",
        template_type="gakuchika",
    )
    assert len(hints) >= 1
    assert "修飾語" in hints[0]
    assert "数値" in hints[0] or "対象名" in hints[0] or "方法" in hints[0]
