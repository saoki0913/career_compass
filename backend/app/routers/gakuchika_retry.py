"""Retry helpers for Gakuchika question generation."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from app.evaluators.question_quality import _evaluate_question_quality
from app.utils.gakuchika_text import (
    BUILD_FOCUS_FALLBACKS,
    DEEPDIVE_FOCUS_FALLBACKS,
)

QuestionGenerationFn = Callable[..., Awaitable[tuple[str, str, dict[str, Any]]]]

_STAGE_TEMPERATURES: tuple[float, float, float] = (0.35, 0.45, 0.25)


def _fallback_templates(is_deepdive: bool) -> dict[str, dict[str, str]]:
    return DEEPDIVE_FOCUS_FALLBACKS if is_deepdive else BUILD_FOCUS_FALLBACKS


def _select_unresolved_focus(
    *,
    focus_key: str,
    asked_focuses: list[str],
    is_deepdive: bool,
) -> str:
    templates = _fallback_templates(is_deepdive)
    if focus_key not in templates:
        return next(iter(templates))

    for candidate in templates:
        if candidate != focus_key and candidate not in asked_focuses:
            return candidate
    for candidate in templates:
        if candidate != focus_key:
            return candidate
    return focus_key


def _retry_guidance_from_violations(violations: list[str]) -> str:
    joined = "、".join(dict.fromkeys(violations)) if violations else "品質基準違反"
    return (
        f"前回の質問は{joined}に該当しました。"
        "以下の点に注意して再生成してください。"
    )


def _build_fallback_payload(
    *,
    focus_key: str,
    is_deepdive: bool,
) -> tuple[str, str, dict[str, Any]]:
    templates = _fallback_templates(is_deepdive)
    resolved_focus = focus_key if focus_key in templates else next(iter(templates))
    meta = templates[resolved_focus]
    payload = {
        "question": meta["question"],
        "focus_key": resolved_focus,
        "answer_hint": meta["answer_hint"],
        "progress_label": meta["progress_label"],
    }
    return meta["question"], resolved_focus, payload


def _is_terminal_payload(payload: dict[str, Any], *, is_deepdive: bool) -> bool:
    if is_deepdive:
        return str(payload.get("deepdive_stage") or "").strip() == "interview_ready"
    return bool(payload.get("ready_for_draft"))


def _normalize_retry_payload(
    *,
    question: str,
    focus_key: str,
    payload: dict[str, Any],
    is_deepdive: bool,
) -> tuple[str, str, dict[str, Any]]:
    templates = _fallback_templates(is_deepdive)
    resolved_focus = focus_key if focus_key in templates else next(iter(templates))
    meta = templates[resolved_focus]
    normalized = dict(payload or {})
    normalized["question"] = question or meta["question"]
    normalized["focus_key"] = resolved_focus
    normalized.setdefault("answer_hint", meta["answer_hint"])
    normalized.setdefault("progress_label", meta["progress_label"])
    return normalized["question"], resolved_focus, normalized


async def _retry_question_generation(
    *,
    generate_fn: QuestionGenerationFn,
    recent_questions: list[str],
    asked_focuses: list[str],
    focus_key: str,
    is_deepdive: bool,
    max_retries: int = 2,
    timeout_seconds: float = 10.0,
) -> tuple[str, str, dict[str, Any], bool]:
    """Return ``(question, focus_key, payload, retry_degraded)``.

    Stage 1 uses the normal generation result. Stage 2 injects retry guidance
    derived from the quality violations. Stage 3 forces the focus onto an
    unresolved element. Stage 4 is a deterministic fallback with no LLM call.
    """
    loop = asyncio.get_running_loop()
    started_at = loop.time()
    stage_count = min(1 + max(0, max_retries), len(_STAGE_TEMPERATURES))
    retry_guidance: str | None = None
    current_focus = focus_key

    for stage_index in range(stage_count):
        elapsed = loop.time() - started_at
        remaining = timeout_seconds - elapsed
        if remaining <= 0:
            break

        forced_focus_key = None
        if stage_index == 2:
            forced_focus_key = _select_unresolved_focus(
                focus_key=current_focus,
                asked_focuses=asked_focuses,
                is_deepdive=is_deepdive,
            )

        try:
            async with asyncio.timeout(remaining):
                question, generated_focus, payload = await generate_fn(
                    temperature=_STAGE_TEMPERATURES[stage_index],
                    retry_guidance=retry_guidance,
                    forced_focus_key=forced_focus_key,
                )
        except TimeoutError:
            break
        except Exception:
            if stage_index >= stage_count - 1:
                break
            retry_guidance = retry_guidance or _retry_guidance_from_violations(
                ["再生成エラー"]
            )
            continue

        question, current_focus, payload = _normalize_retry_payload(
            question=question,
            focus_key=forced_focus_key or generated_focus or current_focus,
            payload=payload,
            is_deepdive=is_deepdive,
        )
        if _is_terminal_payload(payload, is_deepdive=is_deepdive):
            return question, current_focus, payload, stage_index > 0
        evaluation = _evaluate_question_quality(
            question,
            recent_questions,
            current_focus,
            asked_focuses,
        )
        if evaluation["quality_ok"]:
            return question, current_focus, payload, stage_index > 0

        retry_guidance = _retry_guidance_from_violations(
            list(evaluation["violations"])
        )

    question, current_focus, payload = _build_fallback_payload(
        focus_key=current_focus,
        is_deepdive=is_deepdive,
    )
    return question, current_focus, payload, True
