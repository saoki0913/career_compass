"""Tests for retry band hint wording (small/tiny shortfalls)."""

from __future__ import annotations

from app.services.es_review.retry import build_rewrite_retry_plan, _retry_hints_from_codes


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


def test_under_min_retry_plan_carries_overshoot_target_and_guidance() -> None:
    plan = build_rewrite_retry_plan(
        retry_code="under_min",
        failure_codes=["under_min"],
        focus_modes=["length_focus_min"],
        focus_mode="length_focus_min",
        use_tight_length_control=True,
        char_min=390,
        char_max=400,
        original_len=80,
        latest_failed_length=361,
        llm_model="claude-sonnet-4-6",
        template_type="company_motivation",
    )

    assert plan.primary_code == "under_min"
    assert plan.shortfall_delta_band == "small"
    assert plan.length_control_mode == "under_min_recovery"
    assert plan.target_plan.acceptance_band.lower == 390
    assert plan.target_plan.acceptance_band.upper == 400
    assert plan.target_plan.generation_target.lower == 400
    assert plan.target_plan.generation_target.upper and plan.target_plan.generation_target.upper > 400
    assert any("400字" in hint for hint in plan.guidance_items)
