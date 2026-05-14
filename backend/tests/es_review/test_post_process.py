from __future__ import annotations

from app.services.es_review.post_process import (
    coerce_dearu_style,
    normalize_fullwidth,
    post_process_rewrite,
    replace_company_name_with_honorific,
)


def test_replace_company_name_with_honorific_handles_variants() -> None:
    text = "株式会社青空の事業に関心がある。青空株式会社でも青空でも学びたい。"

    result = replace_company_name_with_honorific(
        text,
        company_name="青空",
        industry="銀行",
        grounding_mode="company_general",
    )

    assert result == "貴行の事業に関心がある。貴行でも貴行でも学びたい。"


def test_replace_company_name_with_honorific_preserves_companyless_mode() -> None:
    text = "青空での挑戦に関心がある。"

    result = replace_company_name_with_honorific(
        text,
        company_name="青空",
        industry="銀行",
        grounding_mode="none",
    )

    assert result == text


def test_coerce_dearu_style_adds_safe_conversions() -> None:
    text = "改善しました。課題がありました。現場にいました。力になります。貢献したいと思います。"

    result = coerce_dearu_style(text)

    assert result == "改善した。課題があった。現場にいた。力になる。貢献したい。"


def test_normalize_fullwidth_converts_common_symbols() -> None:
    assert normalize_fullwidth("１２３％（A＆B）：") == "123%(A&B):"


def test_post_process_rewrite_applies_steps_in_order() -> None:
    result = post_process_rewrite(
        "株式会社青空で売上を２０％改善しました。",
        company_name="青空",
        industry=None,
        grounding_mode="company_general",
    )

    assert result == "貴社で売上を20%改善した。"
