"""Contract test for the hand-curated SSOT es_reference_guidance.

Replaces the deleted build-time generator's guarantees: every question type is
populated, type-safe, char-band complete, single-schema, and copy-safe. mypy is
not configured, so type safety is enforced here at runtime.
"""

from __future__ import annotations

import json

import pytest

from app.prompts import es_reference_guidance as g
from app.prompts import logic_patterns, reference_es
from app.services.es_review.template_context import SUPPORTED_COMPOUND_PATTERNS

_TYPES = sorted(g.QUESTION_TYPES)
_BAND_KEYS = {band.value for band in g.CharBand}
_RAW_REFERENCE_MARKERS = (
    "私が貴社を志望する理由は",
    "【内容・詳細】",
    "文字以上",
    "文字以下",
    "お聞かせください",
    "教えてください",
)
_STATISTICAL_KEYS = ("source_count", "frequency_count", "extraction_version")


def _all_strings(obj: object):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for value in obj.values():
            yield from _all_strings(value)
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            yield from _all_strings(item)


@pytest.mark.parametrize("question_type", _TYPES)
def test_all_nine_types_populated_and_type_safe(question_type: str) -> None:
    entry = g.QUESTION_TYPE_GUIDANCE[question_type]
    assert entry, f"{question_type} not curated"
    assert g.validate_guidance_entry(entry) is True
    assert g.get_quality_hints(question_type)
    assert g.get_skeleton(question_type)
    assert g.get_sentence_flow(question_type)
    payload = g.get_logic_patterns_payload(question_type)
    assert payload is not None
    assert payload["question_type"] == question_type
    assert payload["human_reviewed"] is True
    assert payload["patterns"]


@pytest.mark.parametrize("question_type", _TYPES)
def test_six_char_bands_present_and_nonempty(question_type: str) -> None:
    bands = g.QUESTION_TYPE_GUIDANCE[question_type]["bands"]
    assert set(bands) == _BAND_KEYS
    for band_key, skeleton in bands.items():
        assert skeleton and all(
            isinstance(line, str) and line.strip() for line in skeleton
        ), f"{question_type}/{band_key}"


@pytest.mark.parametrize(
    ("char_max", "expected"),
    [
        (50, "le_100"),
        (100, "le_100"),
        (101, "100_200"),
        (200, "100_200"),
        (201, "200_300"),
        (300, "200_300"),
        (301, "300_400"),
        (400, "300_400"),
        (401, "400_500"),
        (500, "400_500"),
        (501, "ge_500"),
        (None, "300_400"),
    ],
)
def test_select_char_band_boundaries(char_max: int | None, expected: str) -> None:
    assert g.select_char_band(char_max).value == expected


def test_get_skeleton_switches_by_band() -> None:
    for question_type in _TYPES:
        short = g.get_skeleton(question_type, char_max=100)
        long = g.get_skeleton(question_type, char_max=400)
        assert short and long
        # 短帯と標準帯の骨子は別物（帯対応が効いている）
        assert short != long
    # char_max 未指定はトップレベル（既定帯）にフォールバック
    assert g.get_skeleton("gakuchika") == g.get_skeleton("gakuchika", char_max=350)


def test_guidance_is_copy_safe() -> None:
    blob = json.dumps(g.QUESTION_TYPE_GUIDANCE, ensure_ascii=False)
    for name in g.KNOWN_COMPANY_NAMES:
        assert name not in blob, f"company name leaked: {name}"
    for marker in _RAW_REFERENCE_MARKERS:
        assert marker not in blob, f"raw reference artifact leaked: {marker}"
    for text in _all_strings(g.QUESTION_TYPE_GUIDANCE):
        assert not text.startswith("NG:")


@pytest.mark.parametrize("question_type", _TYPES)
def test_logic_patterns_use_single_schema_no_statistics(question_type: str) -> None:
    payload = g.QUESTION_TYPE_GUIDANCE[question_type]["logic_patterns"]
    for key in _STATISTICAL_KEYS:
        assert key not in payload, f"{question_type}.logic_patterns has stale {key}"
    for pattern in payload["patterns"]:
        for key in _STATISTICAL_KEYS:
            assert key not in pattern, f"{question_type} pattern has stale {key}"
        assert {"approach_label", "approach_description", "persuasion_key"} <= set(pattern)
        assert len(pattern["approach_description"]) <= 200


def test_get_quality_stats_is_removed() -> None:
    assert not hasattr(g, "get_quality_stats")


_ENUMERATION_TYPES = (
    "gakuchika",
    "company_motivation",
    "intern_reason",
    "role_course_reason",
    "intern_goals",
    "post_join_goals",
)


@pytest.mark.parametrize("question_type", _ENUMERATION_TYPES)
def test_enumeration_phrasing_is_band_keyed_and_type_safe(question_type: str) -> None:
    payload = g.QUESTION_TYPE_GUIDANCE[question_type]["logic_patterns"]
    phrasing = payload.get("enumeration_phrasing")
    assert isinstance(phrasing, dict) and phrasing, question_type
    for band_key, items in phrasing.items():
        assert band_key in _BAND_KEYS, f"{question_type}/{band_key}"
        assert isinstance(items, list) and items
        assert all(isinstance(item, str) and item.strip() for item in items)
        # 列挙要素は句点で独立完結させ、読点で連結しない。
        for item in items:
            assert "、②" not in item
            assert "、第二" not in item
    # 全エントリは validate_guidance_entry を通る。
    assert g.validate_guidance_entry(g.QUESTION_TYPE_GUIDANCE[question_type]) is True


@pytest.mark.parametrize("question_type", ("self_pr", "work_values"))
def test_enumeration_phrasing_absent_for_non_enumeration_types(question_type: str) -> None:
    payload = g.QUESTION_TYPE_GUIDANCE[question_type]["logic_patterns"]
    assert "enumeration_phrasing" not in payload


@pytest.mark.parametrize("question_type", _TYPES)
def test_logic_patterns_block_within_budget_single(question_type: str) -> None:
    """Regression guard: every curated type's logic block stays within budget
    (mypy substitute / long-term: a future SSOT edit cannot silently overflow)."""
    block = logic_patterns.build_logic_patterns_block(question_type, char_max=400)
    assert len(block) <= logic_patterns._BLOCK_CHAR_BUDGET


@pytest.mark.parametrize("pattern", SUPPORTED_COMPOUND_PATTERNS)
def test_logic_patterns_block_within_budget_compound(pattern: tuple[str, ...]) -> None:
    """Worst-case compound (primary + capped secondary supplement) stays within budget."""
    block = logic_patterns.build_logic_patterns_block(
        pattern[0], char_max=400, component_types=list(pattern)
    )
    assert len(block) <= logic_patterns._BLOCK_CHAR_BUDGET


@pytest.mark.parametrize("question_type", _TYPES)
def test_reference_quality_block_keeps_orchestrator_tokens(question_type: str) -> None:
    """Tokens orchestrator depends on for telemetry must survive for every type."""
    block = reference_es.build_reference_quality_block(question_type, char_max=400)
    assert "【参考ESから抽出した骨子】" in block  # reference_outline_used
    assert "【この設問で意識する品質】" in block
    # logic patterns block is gated by CONFIDENCE_MAP/char_max; high/medium types emit it
    if logic_patterns.CONFIDENCE_MAP.get(question_type) in {"high", "medium"}:
        assert "論理アプローチ" in block  # logic_patterns_used
