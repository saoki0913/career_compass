"""
Draft-quality evaluators for the Gakuchika feature.

These are pure functions that take conversation text / draft text and return
structured quality-check dicts and causal-gap lists.  They do not touch
LLMs, requests, or responses.
"""

from __future__ import annotations

import re

from app.utils.gakuchika_text import (
    ACTION_PATTERNS,
    ACTION_REASON_PATTERNS,
    CONNECTIVE_PATTERNS,
    LEARNING_PATTERNS,
    OTHER_ACTOR_PATTERNS,
    RESULT_PATTERNS,
    ROLE_CLARITY_PATTERNS,
    TASK_IMPLICIT_PATTERNS,
    TASK_PATTERNS,
    _contains_any,
    _contains_digit,
    _normalize_text,
    _role_required,
)


_CRITIC_CLOSING_TERMS = (
    "手法",
    "重要性",
    "強制力",
    "段階的導入",
    "品質維持",
    "直結する",
    "と言える",
    "有効である",
)
_OWNED_ACTION_TERMS = (
    "私",
    "自分",
    "取り組",
    "見直",
    "改善",
    "提案",
    "実行",
    "進め",
    "判断",
    "担当",
)


def _last_sentence(text: str) -> str:
    sentences = [s.strip() for s in re.split(r"[。！？]", text or "") if s.strip()]
    return sentences[-1] if sentences else ""


def _detect_gakuchika_critic_closing(draft_text: str, user_origin_text: str = "") -> dict[str, object]:
    """Detect essay-like abstract generalization in the final sentence.

    ガクチカ本文の末尾は、経験での結果・得た学び・身についた能力で締める。
    「手法は〜に直結する」のような評論調は、会話由来でない限り警告対象にする。
    """
    last = _last_sentence(draft_text)
    if not last:
        return {"detected": False, "codes": [], "last_sentence": ""}

    codes: list[str] = []
    has_critic_term = any(term in last for term in _CRITIC_CLOSING_TERMS)
    abstract_subject = bool(re.search(r"(手法|重要性|強制力|段階的導入|品質維持).{0,12}(は|が)", last))
    generalization_shape = bool(re.search(r"ことで、.+(は|が).+(直結する|と言える|有効である)", last))
    has_owned_action = any(term in last for term in _OWNED_ACTION_TERMS)

    if has_critic_term and (abstract_subject or generalization_shape) and not has_owned_action:
        codes.append("abstract_generalization_closing")
    elif generalization_shape and has_critic_term:
        codes.append("critic_closing")

    return {
        "detected": bool(codes),
        "codes": codes,
        "last_sentence": last,
    }


def _build_draft_quality_checks(text: str) -> dict[str, bool]:
    """Evaluate whether conversation/draft text satisfies STAR quality checks.

    Returns a dict keyed by DRAFT_QUALITY_CHECK_KEYS.
    """
    normalized = _normalize_text(text)
    role_required = _role_required(normalized)

    action_hit_count = sum(1 for pat in ACTION_PATTERNS if pat in normalized)
    has_first_person = (
        "私" in normalized or "自分" in normalized or _contains_any(normalized, ROLE_CLARITY_PATTERNS)
    )
    other_actor_marker = _contains_any(normalized, OTHER_ACTOR_PATTERNS)
    action_specific = (not other_actor_marker) and (
        (action_hit_count >= 1 and has_first_person)
        or (action_hit_count >= 2)
    )
    has_task_explicit = _contains_any(normalized, TASK_PATTERNS) and _contains_any(normalized, CONNECTIVE_PATTERNS)
    has_task_implicit = _contains_any(normalized, TASK_IMPLICIT_PATTERNS) and (
        _contains_any(normalized, CONNECTIVE_PATTERNS)
        or _contains_any(normalized, ACTION_PATTERNS)
    )
    task_clarity = has_task_explicit or has_task_implicit
    result_visible = _contains_any(normalized, RESULT_PATTERNS) or _contains_digit(normalized)
    learning_visible = _contains_any(normalized, LEARNING_PATTERNS)
    result_traceability = action_specific and (
        (result_visible and _contains_any(normalized, CONNECTIVE_PATTERNS))
        or _contains_digit(normalized)
    )

    return {
        "task_clarity": task_clarity,
        "action_ownership": action_specific,
        "role_required": role_required,
        "role_clarity": (not role_required) or _contains_any(normalized, ROLE_CLARITY_PATTERNS),
        "result_traceability": result_traceability,
        "learning_reusability": learning_visible and _contains_any(normalized, ("活か", "次", "今後", "再現", "原則")),
    }


def _build_causal_gaps(text: str, quality_checks: dict[str, bool]) -> list[str]:
    """Return string tags describing missing causal connections in the text."""
    normalized = _normalize_text(text)
    gaps: list[str] = []
    if quality_checks.get("task_clarity") and quality_checks.get("action_ownership") and not _contains_any(
        normalized, ACTION_REASON_PATTERNS
    ):
        gaps.append("causal_gap_task_action")
    if quality_checks.get("action_ownership") and not quality_checks.get("result_traceability"):
        gaps.append("causal_gap_action_result")
    if _contains_any(normalized, LEARNING_PATTERNS) and not quality_checks.get("learning_reusability"):
        gaps.append("learning_too_generic")
    if quality_checks.get("role_required") and not quality_checks.get("role_clarity"):
        gaps.append("role_scope_missing")
    return gaps
