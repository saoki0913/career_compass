"""Contract + injection tests for reference-ES enumeration phrasing.

Enumeration phrasing (「第一に〜。第二に〜。」「①〜。②〜。」) is curated per
question type in ``es_reference_guidance`` and surfaced into the rewrite prompt's
``quality_blueprint`` so the LLM reproduces reference-ES論理構成. Each enumerated
clause must be a sentence that stands on its own (句点で独立完結), never joined by
読点.
"""

from __future__ import annotations

import pytest

from app.prompts import logic_patterns as lp
from app.prompts.es_reference_guidance import CharBand, select_char_band
from app.prompts.es_templates import TEMPLATE_DEFS
from app.prompts.es_templates._quality_blueprint import (
    build_quality_blueprint,
    format_quality_blueprint_instruction,
)

_ENUM_TYPES = (
    "gakuchika",
    "company_motivation",
    "intern_reason",
    "role_course_reason",
    "intern_goals",
    "post_join_goals",
)
_NON_ENUM_TYPES = ("self_pr", "work_values")


def _all_enumeration_strings(question_type: str) -> list[str]:
    payload = lp.get_logic_patterns(question_type) or {}
    phrasing = payload.get("enumeration_phrasing")
    if not isinstance(phrasing, dict):
        return []
    out: list[str] = []
    for items in phrasing.values():
        out.extend(str(item) for item in items)
    return out


def test_gakuchika_has_enumeration_for_mid_and_long_bands() -> None:
    payload = lp.get_logic_patterns("gakuchika")
    assert payload is not None
    phrasing = payload.get("enumeration_phrasing")
    assert isinstance(phrasing, dict)
    for band in (
        CharBand.B_200_300.value,
        CharBand.B_300_400.value,
        CharBand.B_400_500.value,
        CharBand.GE_500.value,
    ):
        assert band in phrasing and phrasing[band], band


@pytest.mark.parametrize("question_type", _ENUM_TYPES)
def test_enumeration_clauses_are_period_independent(question_type: str) -> None:
    # 読点で列挙要素をつながない（「①〇〇、②〇〇」を禁止）。
    for text in _all_enumeration_strings(question_type):
        assert "、②" not in text, text
        assert "、第二" not in text, text
        assert "、2つ目" not in text, text


@pytest.mark.parametrize("question_type", _NON_ENUM_TYPES)
def test_non_enumeration_types_have_no_phrasing(question_type: str) -> None:
    payload = lp.get_logic_patterns(question_type) or {}
    assert "enumeration_phrasing" not in payload


def test_build_quality_blueprint_injects_enumeration_for_gakuchika_300_400() -> None:
    blueprint = build_quality_blueprint(
        template_type="gakuchika",
        template_def=TEMPLATE_DEFS["gakuchika"],
        reference_quality_profile=None,
        char_min=390,
        char_max=400,
    )
    assert blueprint.must_improve
    assert any(("第一に" in item or "①" in item) for item in blueprint.must_improve)
    # compact 描画（先頭2件）でも enumeration が残る。
    rendered = format_quality_blueprint_instruction(blueprint, compact=True)
    assert "第一に" in rendered or "①" in rendered


def test_build_quality_blueprint_skips_enumeration_for_self_pr() -> None:
    blueprint = build_quality_blueprint(
        template_type="self_pr",
        template_def=TEMPLATE_DEFS["self_pr"],
        reference_quality_profile=None,
        char_min=190,
        char_max=200,
    )
    rendered = format_quality_blueprint_instruction(blueprint)
    assert "第一に" not in rendered
    assert "①" not in rendered


def test_select_char_band_matches_enumeration_keys() -> None:
    # 400字 → 300_400 帯（今回失敗ケース）。
    assert select_char_band(400) is CharBand.B_300_400
