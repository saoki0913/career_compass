from __future__ import annotations

import pytest

from app.prompts import es_reference_guidance, reference_es


def test_load_reference_examples_does_not_return_raw_runtime_examples() -> None:
    assert reference_es.load_reference_examples("gakuchika", char_max=400) == []


def test_build_reference_quality_profile_is_stats_free() -> None:
    profile = reference_es.build_reference_quality_profile("gakuchika", char_max=400)
    assert profile is not None
    assert profile["quality_hints"] and profile["skeleton"] and profile["sentence_flow"]
    assert profile["char_band"] == "300_400"
    assert profile["is_compound"] is False
    assert profile["component_types"] == ["gakuchika"]
    for removed in (
        "reference_count",
        "average_chars",
        "conditional_hints",
        "conditional_hints_applied",
        "variance_band",
    ):
        assert removed not in profile


def test_skeleton_is_char_band_aware() -> None:
    short = reference_es.build_reference_quality_profile("gakuchika", char_max=100)
    long = reference_es.build_reference_quality_profile("gakuchika", char_max=400)
    assert short["skeleton"] != long["skeleton"]
    assert short["char_band"] == "le_100"
    assert long["char_band"] == "300_400"


def test_build_reference_quality_block_uses_curated_guidance() -> None:
    block = reference_es.build_reference_quality_block("gakuchika", char_max=400)
    assert "【この設問で意識する品質】" in block
    assert "【参考ESから抽出した骨子】" in block  # orchestrator reference_outline token
    assert "【文レベルの流れ】" in block
    assert "論理アプローチ" in block  # curated logic hints remain available without raw corpus files
    assert "冒頭1文で何に取り組み" in block  # curated gakuchika hint
    assert "参考件数" not in block
    assert "目安文字数" not in block
    assert "件中" not in block  # no statistical pattern counts
    assert "参考ESの本文・語句・特徴的な言い回し・細かな構成順を再利用しない" in block


def test_unknown_or_uncurated_type_yields_empty_block(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    guidance = dict(es_reference_guidance.QUESTION_TYPE_GUIDANCE)
    guidance["gakuchika"] = {}
    monkeypatch.setattr(es_reference_guidance, "QUESTION_TYPE_GUIDANCE", guidance)
    assert reference_es.build_reference_quality_profile("gakuchika", char_max=400) is None
    assert reference_es.build_reference_quality_block("gakuchika", char_max=400) == ""


@pytest.mark.parametrize("question_type", sorted(es_reference_guidance.QUESTION_TYPES))
def test_every_type_quality_hints_open_with_conclusion_discipline(
    question_type: str,
) -> None:
    hints = es_reference_guidance.get_quality_hints(question_type)
    assert hints
    assert any("言い切る" in hint for hint in hints)


@pytest.mark.parametrize("question_type", sorted(es_reference_guidance.QUESTION_TYPES))
def test_every_type_quality_hints_guard_sentence_ending_variety(
    question_type: str,
) -> None:
    hints = es_reference_guidance.get_quality_hints(question_type)
    assert any("文末" in hint and "語尾" in hint for hint in hints)


def test_company_motivation_hints_enforce_company_specificity() -> None:
    hints = es_reference_guidance.get_quality_hints("company_motivation")
    assert any("企業名を他社に置き換え" in hint for hint in hints)


def test_no_quality_hint_uses_ng_prefix() -> None:
    for question_type in es_reference_guidance.QUESTION_TYPES:
        assert all(
            not hint.startswith("NG:")
            for hint in es_reference_guidance.get_quality_hints(question_type)
        )
