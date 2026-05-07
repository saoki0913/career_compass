"""Tests for _normalize_conversation_context postDraftAwaitingResume field."""

from backend.app.routers.motivation_context import _normalize_conversation_context


def test_post_draft_awaiting_resume_defaults_to_false():
    ctx = _normalize_conversation_context(None)
    assert ctx["postDraftAwaitingResume"] is False


def test_post_draft_awaiting_resume_defaults_to_false_when_missing():
    ctx = _normalize_conversation_context({"conversationMode": "slot_fill"})
    assert ctx["postDraftAwaitingResume"] is False


def test_post_draft_awaiting_resume_preserves_true():
    ctx = _normalize_conversation_context({"postDraftAwaitingResume": True})
    assert ctx["postDraftAwaitingResume"] is True


def test_post_draft_awaiting_resume_coerces_falsy():
    ctx = _normalize_conversation_context({"postDraftAwaitingResume": 0})
    assert ctx["postDraftAwaitingResume"] is False
