import asyncio

import pytest

from app.routers.gakuchika_retry import _retry_question_generation
from app.utils.gakuchika_text import (
    BUILD_FOCUS_FALLBACKS,
    DEEPDIVE_FOCUS_FALLBACKS,
)


@pytest.mark.asyncio
async def test_retry_question_generation_accepts_valid_question_without_retry() -> None:
    calls: list[dict[str, object]] = []

    async def generate_fn(**kwargs):
        calls.append(kwargs)
        return (
            "その状況を、なぜ本当に解くべき課題だと判断したのですか。",
            "challenge",
            {
                "question": "その状況を、なぜ本当に解くべき課題だと判断したのですか。",
                "focus_key": "challenge",
            },
        )

    question, resolved_focus, payload, retry_degraded = await _retry_question_generation(
        generate_fn=generate_fn,
        recent_questions=[],
        asked_focuses=[],
        focus_key="challenge",
        is_deepdive=True,
    )

    assert question == "その状況を、なぜ本当に解くべき課題だと判断したのですか。"
    assert resolved_focus == "challenge"
    assert payload["focus_key"] == "challenge"
    assert retry_degraded is False
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_retry_question_generation_improves_prohibited_question() -> None:
    calls: list[dict[str, object]] = []
    responses = iter(
        [
            (
                "もっと教えてください。",
                "challenge",
                {"question": "もっと教えてください。", "focus_key": "challenge"},
            ),
            (
                "その状況を、なぜ本当に解くべき課題だと判断したのですか。",
                "challenge",
                {
                    "question": "その状況を、なぜ本当に解くべき課題だと判断したのですか。",
                    "focus_key": "challenge",
                },
            ),
        ]
    )

    async def generate_fn(**kwargs):
        calls.append(kwargs)
        return next(responses)

    question, resolved_focus, _payload, retry_degraded = await _retry_question_generation(
        generate_fn=generate_fn,
        recent_questions=[],
        asked_focuses=[],
        focus_key="challenge",
        is_deepdive=True,
    )

    assert question == "その状況を、なぜ本当に解くべき課題だと判断したのですか。"
    assert resolved_focus == "challenge"
    assert retry_degraded is True
    assert len(calls) == 2
    assert "抽象的な質問" in str(calls[1].get("retry_guidance"))


@pytest.mark.asyncio
async def test_retry_question_generation_uses_fallback_after_all_retries_fail() -> None:
    async def generate_fn(**kwargs):
        return (
            "もっと教えてください。",
            "challenge",
            {"question": "もっと教えてください。", "focus_key": "challenge"},
        )

    question, resolved_focus, payload, retry_degraded = await _retry_question_generation(
        generate_fn=generate_fn,
        recent_questions=[],
        asked_focuses=[],
        focus_key="challenge",
        is_deepdive=True,
    )

    assert question == DEEPDIVE_FOCUS_FALLBACKS["role"]["question"]
    assert resolved_focus == "role"
    assert payload["focus_key"] == "role"
    assert retry_degraded is True


@pytest.mark.asyncio
async def test_retry_question_generation_falls_back_on_timeout() -> None:
    async def generate_fn(**kwargs):
        await asyncio.sleep(0.05)
        return (
            "その方法を選んだのは、どんな理由や比較があったからですか。",
            "action_reason",
            {
                "question": "その方法を選んだのは、どんな理由や比較があったからですか。",
                "focus_key": "action_reason",
            },
        )

    question, resolved_focus, payload, retry_degraded = await _retry_question_generation(
        generate_fn=generate_fn,
        recent_questions=[],
        asked_focuses=[],
        focus_key="action_reason",
        is_deepdive=True,
        timeout_seconds=0.01,
    )

    assert question == DEEPDIVE_FOCUS_FALLBACKS["action_reason"]["question"]
    assert resolved_focus == "action_reason"
    assert payload["focus_key"] == "action_reason"
    assert retry_degraded is True


@pytest.mark.asyncio
async def test_retry_question_generation_changes_focus_on_stage_three() -> None:
    calls: list[dict[str, object]] = []

    async def generate_fn(**kwargs):
        calls.append(kwargs)
        forced_focus_key = kwargs.get("forced_focus_key")
        if len(calls) < 3:
            return (
                "もっと教えてください。",
                "challenge",
                {"question": "もっと教えてください。", "focus_key": "challenge"},
            )
        return (
            DEEPDIVE_FOCUS_FALLBACKS[str(forced_focus_key)]["question"],
            str(forced_focus_key),
            {
                "question": DEEPDIVE_FOCUS_FALLBACKS[str(forced_focus_key)]["question"],
                "focus_key": forced_focus_key,
            },
        )

    question, resolved_focus, payload, retry_degraded = await _retry_question_generation(
        generate_fn=generate_fn,
        recent_questions=[],
        asked_focuses=["challenge"],
        focus_key="challenge",
        is_deepdive=True,
    )

    assert len(calls) == 3
    assert calls[2]["forced_focus_key"] == "role"
    assert question == DEEPDIVE_FOCUS_FALLBACKS["role"]["question"]
    assert resolved_focus == "role"
    assert payload["focus_key"] == "role"
    assert retry_degraded is True


@pytest.mark.asyncio
async def test_retry_question_generation_marks_retry_degraded_for_build_retry() -> None:
    responses = iter(
        [
            (
                "もっと教えてください。",
                "task",
                {"question": "もっと教えてください。", "focus_key": "task"},
            ),
            (
                BUILD_FOCUS_FALLBACKS["task"]["question"],
                "task",
                {
                    "question": BUILD_FOCUS_FALLBACKS["task"]["question"],
                    "focus_key": "task",
                },
            ),
        ]
    )

    async def generate_fn(**kwargs):
        return next(responses)

    question, resolved_focus, payload, retry_degraded = await _retry_question_generation(
        generate_fn=generate_fn,
        recent_questions=[],
        asked_focuses=[],
        focus_key="task",
        is_deepdive=False,
    )

    assert question == BUILD_FOCUS_FALLBACKS["task"]["question"]
    assert resolved_focus == "task"
    assert payload["focus_key"] == "task"
    assert retry_degraded is True
