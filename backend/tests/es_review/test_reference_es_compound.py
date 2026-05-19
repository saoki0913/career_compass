"""Compound ES reference-guidance merge.

Mirrors ``template_context.merge_template_specs``: the primary leads, each
secondary contributes a capped, deduped supplement, and the primary's char-band
skeleton stays the structural backbone.
"""

from __future__ import annotations

import pytest

from app.prompts import es_reference_guidance, reference_es
from app.services.es_review.template_context import SUPPORTED_COMPOUND_PATTERNS

_MERGED_HINT_CAP = 10


def test_single_type_is_backward_compatible() -> None:
    bare = reference_es.build_reference_quality_profile("gakuchika", char_max=400)
    none_ct = reference_es.build_reference_quality_profile(
        "gakuchika", char_max=400, component_types=None
    )
    self_ct = reference_es.build_reference_quality_profile(
        "gakuchika", char_max=400, component_types=["gakuchika"]
    )
    assert bare == none_ct == self_ct
    assert bare["is_compound"] is False
    assert bare["component_types"] == ["gakuchika"]


def test_compound_is_primary_led_with_secondary_supplement() -> None:
    primary_hints = reference_es.build_reference_quality_profile(
        "company_motivation", char_max=400
    )["quality_hints"]
    secondary_hints = es_reference_guidance.get_quality_hints("post_join_goals")

    profile = reference_es.build_reference_quality_profile(
        "company_motivation",
        char_max=400,
        component_types=["company_motivation", "post_join_goals"],
    )
    assert profile["is_compound"] is True
    assert profile["component_types"] == ["company_motivation", "post_join_goals"]

    merged = profile["quality_hints"]
    # primary leads: all primary hints retained
    assert primary_hints == merged[: len(primary_hints)]
    # secondary contributes (capped) and is deduped + bounded
    assert any(hint in merged for hint in secondary_hints)
    assert len(merged) <= _MERGED_HINT_CAP
    assert len(merged) == len(set(merged))


def test_compound_skeleton_keeps_primary_band_backbone() -> None:
    primary_skeleton = reference_es.build_reference_quality_profile(
        "company_motivation", char_max=400
    )["skeleton"]
    profile = reference_es.build_reference_quality_profile(
        "company_motivation",
        char_max=400,
        component_types=["company_motivation", "post_join_goals"],
    )
    skeleton = profile["skeleton"]
    # primary 300-400 band skeleton is preserved verbatim as the backbone
    assert skeleton[: len(primary_skeleton)] == primary_skeleton
    # exactly one appended compound note (no machine-interleaved second skeleton)
    assert skeleton[-1].startswith("（複合）")
    assert sum("（複合）" in line for line in skeleton) == 1


def test_compound_sentence_flow_notes_composition() -> None:
    profile = reference_es.build_reference_quality_profile(
        "company_motivation",
        char_max=400,
        component_types=["company_motivation", "post_join_goals"],
    )
    assert "複合設問のため主骨格" in profile["sentence_flow"].get("transition_pattern", "")


def test_compound_block_renders_secondary_logic_supplement() -> None:
    block = reference_es.build_reference_quality_block(
        "company_motivation",
        char_max=400,
        component_types=["company_motivation", "post_join_goals"],
    )
    assert "【この設問で意識する品質】" in block
    assert "（複合）" in block
    assert "補助アプローチ（複合）" in block


@pytest.mark.parametrize("pattern", SUPPORTED_COMPOUND_PATTERNS)
def test_all_supported_compound_patterns_merge_cleanly(pattern: tuple[str, ...]) -> None:
    types = list(pattern)
    profile = reference_es.build_reference_quality_profile(
        types[0], char_max=400, component_types=types
    )
    assert profile is not None
    assert profile["quality_hints"] and profile["skeleton"]
    assert len(profile["quality_hints"]) <= _MERGED_HINT_CAP
    assert len(profile["quality_hints"]) == len(set(profile["quality_hints"]))
    distinct = [t for i, t in enumerate(types) if t not in types[:i]]
    assert profile["is_compound"] is (len(distinct) > 1)
