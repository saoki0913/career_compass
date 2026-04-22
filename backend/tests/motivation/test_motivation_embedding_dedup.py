"""Phase 5: semantic duplicate detection for motivation questions."""

from __future__ import annotations

import asyncio

import pytest

from app.config import settings
from app.routers.motivation_validation import _is_semantically_duplicate_question


@pytest.mark.asyncio
async def test_semantic_duplicate_returns_false_when_flag_disabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "motivation_embedding_dedup", False)

    called = False

    async def _fake_embeddings(_texts: list[str]) -> list[list[float] | None]:
        nonlocal called
        called = True
        return [[1.0, 0.0], [1.0, 0.0]]

    result = await _is_semantically_duplicate_question(
        candidate_question="貴社を志望する理由を教えてください。",
        assistant_questions=["なぜこの会社を選ぶのですか？"],
        generate_embeddings_fn=_fake_embeddings,
    )

    assert result is False
    assert called is False


@pytest.mark.asyncio
async def test_semantic_duplicate_detects_high_similarity(monkeypatch) -> None:
    monkeypatch.setattr(settings, "motivation_embedding_dedup", True)

    async def _fake_embeddings(_texts: list[str]) -> list[list[float] | None]:
        return [
            [1.0, 0.0],
            [0.98, 0.02],
            [0.10, 0.99],
        ]

    result = await _is_semantically_duplicate_question(
        candidate_question="貴社を志望する理由を教えてください。",
        assistant_questions=[
            "なぜこの会社を選ぶのですか？",
            "入社後にやりたい仕事は何ですか？",
        ],
        generate_embeddings_fn=_fake_embeddings,
    )

    assert result is True


@pytest.mark.asyncio
async def test_semantic_duplicate_ignores_low_similarity(monkeypatch) -> None:
    monkeypatch.setattr(settings, "motivation_embedding_dedup", True)

    async def _fake_embeddings(_texts: list[str]) -> list[list[float] | None]:
        return [
            [1.0, 0.0],
            [0.0, 1.0],
        ]

    result = await _is_semantically_duplicate_question(
        candidate_question="入社後にやりたい仕事は何ですか？",
        assistant_questions=["なぜこの会社を選ぶのですか？"],
        generate_embeddings_fn=_fake_embeddings,
    )

    assert result is False


@pytest.mark.asyncio
async def test_semantic_duplicate_times_out_fail_open(monkeypatch) -> None:
    monkeypatch.setattr(settings, "motivation_embedding_dedup", True)
    monkeypatch.setattr(settings, "motivation_embedding_dedup_timeout_seconds", 0.01)

    async def _slow_embeddings(_texts: list[str]) -> list[list[float] | None]:
        await asyncio.sleep(0.05)
        return [[1.0, 0.0], [1.0, 0.0]]

    result = await _is_semantically_duplicate_question(
        candidate_question="貴社を志望する理由を教えてください。",
        assistant_questions=["なぜこの会社を選ぶのですか？"],
        generate_embeddings_fn=_slow_embeddings,
    )

    assert result is False
