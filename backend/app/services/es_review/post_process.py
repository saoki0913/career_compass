"""Mechanical post-processing for ES rewrite candidates."""

from __future__ import annotations

import re

from app.prompts.es_templates._common import get_company_honorific


_FULLWIDTH_TRANSLATION = str.maketrans(
    {
        "０": "0",
        "１": "1",
        "２": "2",
        "３": "3",
        "４": "4",
        "５": "5",
        "６": "6",
        "７": "7",
        "８": "8",
        "９": "9",
        "％": "%",
        "（": "(",
        "）": ")",
        "＆": "&",
        "：": ":",
    }
)

_NAME_BOUNDARY = r"A-Za-z0-9"


def normalize_fullwidth(text: str) -> str:
    """Normalize common fullwidth characters used in ES text."""
    return text.translate(_FULLWIDTH_TRANSLATION)


def coerce_dearu_style(text: str) -> str:
    """Safely reduce polite style into da/dearu style."""
    if not any(marker in text for marker in ("です", "ます", "ました")):
        return text
    t = text
    regex_pairs = (
        (r"したい(?:です|と思います|と考えています)", "したい"),
        (r"なりたい(?:です|と思います|と考えています)", "なりたい"),
        (r"学びたい(?:です|と思います|と考えています)", "学びたい"),
        (r"磨きたい(?:です|と思います|と考えています)", "磨きたい"),
        (r"高めたい(?:です|と思います|と考えています)", "高めたい"),
        (r"深めたい(?:です|と思います|と考えています)", "深めたい"),
        (r"試したい(?:です|と思います|と考えています)", "試したい"),
        (r"身につけたい(?:です|と思います|と考えています)", "身につけたい"),
        (r"活かしたい(?:です|と思います|と考えています)", "活かしたい"),
        (r"生かしたい(?:です|と思います|と考えています)", "生かしたい"),
        (r"携わりたい(?:です|と思います|と考えています)", "携わりたい"),
        (r"貢献したい(?:です|と思います|と考えています)", "貢献したい"),
        (r"考えています", "考える"),
        (r"思います", "考える"),
    )
    for pattern, replacement in regex_pairs:
        t = re.sub(pattern, replacement, t)
    pairs = (
        ("しています", "している"),
        ("いています", "いている"),
        ("なっています", "なっている"),
        ("でいます", "でいる"),
        ("であります", "である"),
        ("しました", "した"),
        ("いました", "いた"),
        ("ありました", "あった"),
        ("なります", "なる"),
        ("あります。", "ある。"),
        ("あります", "ある"),
        ("でした。", "だった。"),
        ("でした", "だった"),
        ("ですので", "ため"),
        ("ですから", "から"),
        ("ですが", "だが"),
        ("です。", "だ。"),
        ("です", "だ"),
    )
    for old, new in pairs:
        t = t.replace(old, new)
    t = re.sub(r"([ぁ-んァ-ン一-龥A-Za-z0-9]+たい)だ(?=。|$)", r"\1", t)
    t = t.strip()
    return t if t else text


def _company_name_variants(company_name: str) -> list[str]:
    raw = company_name.strip()
    if not raw:
        return []
    base = re.sub(r"^株式会社", "", raw)
    base = re.sub(r"株式会社$", "", base).strip()
    variants = [raw]
    if base:
        variants.extend([f"株式会社{base}", f"{base}株式会社", base])
    return sorted(set(variants), key=len, reverse=True)


def replace_company_name_with_honorific(
    text: str,
    company_name: str | None,
    industry: str | None,
    grounding_mode: str,
) -> str:
    """Replace company name variants with the appropriate honorific."""
    if grounding_mode == "none" or not company_name:
        return text
    honorific = get_company_honorific(industry)
    rewritten = text
    for variant in _company_name_variants(company_name):
        pattern = rf"(?<![{_NAME_BOUNDARY}]){re.escape(variant)}(?![{_NAME_BOUNDARY}])"
        rewritten = re.sub(pattern, honorific, rewritten)
    return rewritten


def post_process_rewrite(
    text: str,
    *,
    company_name: str | None,
    industry: str | None,
    grounding_mode: str,
) -> str:
    """Apply deterministic post-processing before validation."""
    candidate = normalize_fullwidth(text)
    candidate = coerce_dearu_style(candidate)
    return replace_company_name_with_honorific(
        candidate,
        company_name,
        industry,
        grounding_mode,
    )
