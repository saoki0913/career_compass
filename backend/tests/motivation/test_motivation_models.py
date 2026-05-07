"""Pydantic model boundary tests for motivation request schemas.

``conversation_history`` size guard (max_length=60) on
``NextQuestionRequest`` / ``GenerateDraftRequest`` to bound payload size.
Summarization handles conversations beyond 20 messages; 60 is a safety margin.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.routers.motivation_models import (
    GenerateDraftRequest,
    Message,
    NextQuestionRequest,
)


def _make_messages(n: int) -> list[Message]:
    """Generate a deterministic list of ``n`` user/assistant messages."""

    return [
        Message(role="user" if i % 2 == 0 else "assistant", content=f"msg {i}")
        for i in range(n)
    ]


class TestNextQuestionRequestMaxLength:
    def test_60_messages_accepted(self) -> None:
        req = NextQuestionRequest(
            company_id="c1",
            company_name="Test Co",
            conversation_history=_make_messages(60),
        )
        assert len(req.conversation_history) == 60

    def test_61_messages_rejected(self) -> None:
        with pytest.raises(ValidationError):
            NextQuestionRequest(
                company_id="c1",
                company_name="Test Co",
                conversation_history=_make_messages(61),
            )


class TestGenerateDraftRequestMaxLength:
    def test_60_messages_accepted(self) -> None:
        req = GenerateDraftRequest(
            company_id="c1",
            company_name="Test Co",
            conversation_history=_make_messages(60),
        )
        assert len(req.conversation_history) == 60

    def test_61_messages_rejected(self) -> None:
        with pytest.raises(ValidationError):
            GenerateDraftRequest(
                company_id="c1",
                company_name="Test Co",
                conversation_history=_make_messages(61),
            )

    def test_is_regeneration_defaults_to_false(self) -> None:
        req = GenerateDraftRequest(
            company_id="c1",
            company_name="Test Co",
            conversation_history=_make_messages(2),
        )
        assert req.is_regeneration is False

    def test_is_regeneration_accepts_true(self) -> None:
        req = GenerateDraftRequest(
            company_id="c1",
            company_name="Test Co",
            conversation_history=_make_messages(2),
            is_regeneration=True,
        )
        assert req.is_regeneration is True
