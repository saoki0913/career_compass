"""Tests for _infer_focus_from_question_text in question planner."""
from app.normalization.gakuchika_question_planner import _infer_focus_from_question_text


def test_infer_context():
    assert _infer_focus_from_question_text("その活動に取り組んだ背景を教えてください") == "context"


def test_infer_task():
    assert _infer_focus_from_question_text("どのような課題がありましたか？") == "task"


def test_infer_action():
    assert _infer_focus_from_question_text("具体的にどんな行動を取りましたか？") == "action"


def test_infer_result():
    assert _infer_focus_from_question_text("最終的にどんな成果が出ましたか？") == "result"


def test_infer_learning():
    assert _infer_focus_from_question_text("この経験から何を学びましたか？") == "learning"


def test_infer_none():
    assert _infer_focus_from_question_text("こんにちは") is None
    assert _infer_focus_from_question_text("") is None
