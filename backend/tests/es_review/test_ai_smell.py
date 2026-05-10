from __future__ import annotations

import pytest

from app.services.es_review.ai_smell import (
    build_ai_smell_retry_hints,
    compute_ai_smell_score,
    detect_ai_smell_patterns,
    format_anti_ai_phrase_lines,
)


@pytest.mark.parametrize(
    ("text", "expected_category", "expected_phrase"),
    [
        ("多角的に物事を捉えた。", "abstract_buzzword", "多角的に"),
        ("幅広い視野を持って取り組んだ。", "abstract_buzzword", "幅広い視野"),
        ("新たな価値を生み出すことを目指した。", "value_creation", "新たな価値を生み出す"),
        ("付加価値を提供できる人材になりたい。", "value_creation", "付加価値を提供"),
        ("活動を通じて成長した。", "growth_cliche", "を通じて成長した"),
        ("協働の重要性を学んだ。", "growth_cliche", "の重要性を学んだ"),
        ("関係者を巻き込み進めた。", "relation_abstract", "関係者を巻き込み"),
        ("ステークホルダーと向き合った。", "relation_abstract", "ステークホルダー"),
        ("社会に貢献したい。", "ceremonial_closing", "に貢献したい"),
        ("変革を実現したい。", "ceremonial_closing", "を実現したい"),
        ("まさに必要な経験だった。", "empty_emphasis", "まさに"),
        ("重要だったと言えるでしょう。", "empty_emphasis", "と言えるでしょう"),
    ],
)
def test_detects_each_category(
    text: str,
    expected_category: str,
    expected_phrase: str,
) -> None:
    warnings = detect_ai_smell_patterns(text, "")

    assert [(w.category, w.phrase) for w in warnings] == [
        (expected_category, expected_phrase)
    ]


@pytest.mark.parametrize(
    "text",
    [
        "課題を分析し、改善策を提案した。",
        "現場の3名に聞き取り、導線を直した。",
        "活動後、行動量が変わった。",
        "店舗運営で課題を整理した。",
        "同期と役割を分けて作業した。",
        "結果として応募数が2倍になった。",
    ],
)
def test_plain_specific_sentences_are_not_detected(text: str) -> None:
    assert detect_ai_smell_patterns(text, "") == []


def test_excludes_phrases_already_present_in_user_answer() -> None:
    warnings = detect_ai_smell_patterns(
        "関係者を巻き込み、活動を進めた。",
        "関係者を巻き込みました。",
    )

    assert warnings == []


@pytest.mark.parametrize(
    "text",
    [
        "30名の新歓担当と多角的に課題を整理した。",
        "営業部と連携し、価値を創出する提案をまとめた。",
        "メンバーに交渉し、関係者を巻き込み改善した。",
    ],
)
def test_specificity_markers_suppress_abstract_categories(text: str) -> None:
    assert detect_ai_smell_patterns(text, "") == []


def test_empty_emphasis_does_not_require_specificity_check() -> None:
    warnings = detect_ai_smell_patterns("30名で進めたことはまさに転機だった。", "")

    assert [w.category for w in warnings] == ["empty_emphasis"]


def test_scoring_uses_template_and_length_thresholds() -> None:
    warnings = detect_ai_smell_patterns(
        "多角的に考えた。価値を創出した。",
        "",
        template_type="gakuchika",
        char_max=200,
    )
    result = compute_ai_smell_score(
        warnings,
        template_type="gakuchika",
        char_max=200,
    )

    assert result["score"] == 4.5
    assert result["tier"] == 2
    assert result["band"] == "short"
    assert result["threshold"] == 3.0
    assert [w["code"] for w in result["warnings"]] == [
        "abstract_buzzword",
        "value_creation",
    ]


def test_scoring_tier_one_when_below_mid_long_default_threshold() -> None:
    warnings = detect_ai_smell_patterns("まさに転機だった。確かに学びもあった。", "")
    result = compute_ai_smell_score(
        warnings,
        template_type="company_motivation",
        char_max=400,
    )

    assert result["score"] == 2.0
    assert result["tier"] == 1
    assert result["band"] == "mid_long"
    assert result["threshold"] == 4.0


def test_retry_hints_use_first_three_warnings_and_dedupe() -> None:
    warnings = detect_ai_smell_patterns(
        "多角的に考えた。包括的に考えた。価値を創出した。まさに必要だった。",
        "",
    )

    hints = build_ai_smell_retry_hints(warnings)

    assert len(hints) == 2
    assert "抽象修飾語" in hints[0]
    assert "価値を創出" in hints[1]


def test_format_anti_ai_phrase_lines_uses_category_labels() -> None:
    lines = format_anti_ai_phrase_lines()

    assert len(lines) == 6
    assert lines[0].startswith("- 抽象修飾:")
    assert any("空虚強調" in line for line in lines)
