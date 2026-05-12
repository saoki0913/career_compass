"""Verify planning constants stay within expected bounds."""

from __future__ import annotations

import importlib


def test_question_budget_constants_are_in_range() -> None:
    planning = importlib.import_module("app.routers._interview.planning")
    soft_min = planning.QUESTION_SOFT_MIN
    hard_max = planning.QUESTION_HARD_MAX
    assert isinstance(soft_min, int)
    assert isinstance(hard_max, int)
    assert 10 <= soft_min <= 15, f"QUESTION_SOFT_MIN={soft_min} out of [10,15]"
    assert 15 <= hard_max <= 20, f"QUESTION_HARD_MAX={hard_max} out of [15,20]"
    assert soft_min < hard_max, "SOFT_MIN must be less than HARD_MAX"


def test_question_soft_min_is_13() -> None:
    planning = importlib.import_module("app.routers._interview.planning")
    assert planning.QUESTION_SOFT_MIN == 13


def test_question_hard_max_is_17() -> None:
    planning = importlib.import_module("app.routers._interview.planning")
    assert planning.QUESTION_HARD_MAX == 17


# ---------------------------------------------------------------------------
# _fallback_next_question_hint tests
# ---------------------------------------------------------------------------

def _get_hint_fn():
    planning = importlib.import_module("app.routers._interview.planning")
    return planning._fallback_next_question_hint


class TestFallbackNextQuestionHint:
    """Tests for _fallback_next_question_hint with followup_style and topic fallback."""

    # -- followup_style hit (existing behaviour) --

    def test_followup_style_known_returns_hint(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "reason_check"})
        assert result is not None
        assert "なぜ" in result

    def test_followup_style_with_whitespace_is_stripped(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "  specificity_check  "})
        assert result is not None
        assert "具体的" in result

    def test_followup_style_unknown_returns_none_without_topic(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "nonexistent_style"})
        assert result is None

    # -- new followup_style entries --

    def test_value_alignment_check_hint(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "value_alignment_check"})
        assert result is not None
        assert "価値観" in result

    def test_impact_check_hint(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "impact_check"})
        assert result is not None
        assert "影響" in result

    def test_learning_check_hint(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "learning_check"})
        assert result is not None
        assert "学び" in result or "学んだ" in result or "活かし" in result

    # -- topic fallback (new behaviour) --

    def test_topic_fallback_when_no_followup_style(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"topic": "gakuchika"})
        assert result is not None
        assert "なぜ" in result

    def test_topic_fallback_when_followup_style_unknown(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "nonexistent_style", "topic": "leadership"})
        assert result is not None
        assert "チーム" in result

    def test_topic_with_whitespace_is_stripped(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"topic": "  self_pr  "})
        assert result is not None
        assert "エピソード" in result

    def test_topic_unknown_returns_none(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"topic": "unknown_topic"})
        assert result is None

    def test_followup_style_takes_precedence_over_topic(self) -> None:
        """followup_style match should be returned even when topic is also present."""
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "reason_check", "topic": "leadership"})
        assert result is not None
        # Should be the followup_style hint, not the topic one
        assert "なぜ" in result
        assert "チーム" not in result

    # -- edge cases --

    def test_empty_dict_returns_none(self) -> None:
        hint_fn = _get_hint_fn()
        assert hint_fn({}) is None

    def test_non_dict_returns_none(self) -> None:
        hint_fn = _get_hint_fn()
        assert hint_fn("not a dict") is None  # type: ignore[arg-type]

    def test_none_followup_style_falls_through_to_topic(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": None, "topic": "career"})
        assert result is not None
        assert "将来" in result

    def test_empty_string_followup_style_falls_through_to_topic(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": "", "topic": "teamwork"})
        assert result is not None
        assert "メンバー" in result

    def test_int_followup_style_falls_through_to_topic(self) -> None:
        hint_fn = _get_hint_fn()
        result = hint_fn({"followup_style": 42, "topic": "strengths"})
        assert result is not None
        assert "強み" in result

    # -- all topic entries exist --

    def test_all_topic_entries_return_non_empty_strings(self) -> None:
        planning = importlib.import_module("app.routers._interview.planning")
        topic_map = planning._NEXT_QUESTION_HINT_BY_TOPIC
        assert len(topic_map) >= 8, f"Expected at least 8 topic hints, got {len(topic_map)}"
        for key, value in topic_map.items():
            assert isinstance(key, str) and key.strip(), f"Invalid topic key: {key!r}"
            assert isinstance(value, str) and value.strip(), f"Empty hint for topic {key!r}"

    # -- all followup_style entries exist (including new ones) --

    def test_all_followup_style_entries_have_11_items(self) -> None:
        planning = importlib.import_module("app.routers._interview.planning")
        style_map = planning._NEXT_QUESTION_HINT_BY_FOLLOWUP_STYLE
        assert len(style_map) == 11, (
            f"Expected 11 followup_style entries (8 original + 3 new), got {len(style_map)}"
        )
