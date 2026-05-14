"""Tests for draft_quality passthrough and focus inference.

_infer_focus_from_question_text is tested here; STAR-alignment interaction
is covered by test_gakuchika_next_question.py.
"""
from app.normalization.gakuchika_payload import _default_state
from app.normalization.gakuchika_question_planner import _infer_focus_from_question_text


def test_default_state_includes_draft_quality_none():
    state = _default_state()
    assert state["draft_quality"] is None


def test_default_state_passes_through_draft_quality():
    quality = {
        "status": "warning",
        "warnings": ["short"],
        "retry_count": 1,
        "failure_codes": ["char_count_low"],
        "selection_reason": "retry_improved",
    }
    state = _default_state(draft_quality=quality)
    assert state["draft_quality"] == quality


class TestInferFocusFromQuestionText:
    def test_detects_context_keywords(self):
        assert _infer_focus_from_question_text("その活動に取り組んだ背景を教えてください") == "context"

    def test_detects_task_keywords(self):
        assert _infer_focus_from_question_text("どのような課題がありましたか？") == "task"

    def test_detects_action_keywords(self):
        assert _infer_focus_from_question_text("具体的にどんな行動を取りましたか？") == "action"

    def test_detects_result_keywords(self):
        assert _infer_focus_from_question_text("最終的にどんな成果が出ましたか？") == "result"

    def test_detects_learning_keywords(self):
        assert _infer_focus_from_question_text("この経験から何を学びましたか？") == "learning"

    def test_returns_none_for_unrecognized(self):
        assert _infer_focus_from_question_text("こんにちは") is None

    def test_returns_none_for_empty(self):
        assert _infer_focus_from_question_text("") is None
