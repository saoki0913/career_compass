"""
Deep-dive completion evaluator for the Gakuchika feature.

Given a conversation corpus and a draft, decides whether the story has
enough evidence / causal clarity / credibility / learning-transfer markers
to call the deep-dive phase complete.  Pure function — no IO, no LLM.
"""

from __future__ import annotations

from typing import Any

from app.utils.gakuchika_text import (
    ACTION_REASON_PATTERNS,
    CONNECTIVE_PATTERNS,
    LEARNING_CONCRETE_PATTERNS,
    LEARNING_TRANSFER_PATTERNS,
    LEARNING_WISH_ONLY_PATTERNS,
    RESULT_SOFT_MARKERS,
    ROLE_CLARITY_PATTERNS,
    SHALLOW_REASON_HEDGES,
    TASK_PATTERNS,
    UNCERTAINTY_MARKERS,
    _contains_any,
    _contains_digit,
    _normalize_text,
    _role_required,
)


_CREDIBILITY_RISK_MARKERS = (
    "先輩が担当",
    "主に先輩",
    "他のメンバーが担当",
    "サポートに回った",
    "提案はしたが",
    "実行は主に",
)


def _format_message_list(messages: list[Any]) -> str:
    """Format a ``[Message, …]`` list into the "質問/回答" transcript string.

    Accepts any object exposing ``.role`` (``"user" | "assistant"``) and
    ``.content`` (``str``) — allows the router to pass its own ``Message``
    dataclass without importing it here.
    """
    formatted: list[str] = []
    for msg in messages:
        role = getattr(msg, "role", "")
        content = getattr(msg, "content", "")
        role_label = "質問" if role == "assistant" else "回答"
        formatted.append(f"{role_label}: {content}")
    return "\n\n".join(formatted)


def _evaluate_deepdive_completion(
    conversation_text: str,
    draft_text: str | list[Any],
    focus_key: str | None = None,
) -> dict[str, object]:
    """Evaluate whether the deep-dive phase can be closed.

    The second positional argument historically accepted ``list[Message]``
    with swapped semantics.  That legacy shape is preserved here for
    backward compatibility with existing router call sites.

    Returns a dict with keys: ``complete``, ``completion_checks``,
    ``missing_reasons``, ``completion_reasons``, ``focus_key``.
    """
    if isinstance(draft_text, list):
        legacy_eval = _evaluate_deepdive_completion(
            _format_message_list(draft_text), conversation_text, focus_key
        )
        return {
            "deepdive_complete": bool(legacy_eval["complete"]),
            "completion_reasons": [] if legacy_eval["complete"] else list(legacy_eval["missing_reasons"]),
        }

    combined = _normalize_text(f"{draft_text}\n{conversation_text}")
    role_needed = _role_required(combined) or focus_key in {"role", "credibility"}

    # Context-aware negative evidence: keyword surface hits must not be hijacked
    # by generic feelings ("大事だと思った") or by self-admitted uncertainty
    # ("数字までは分かりません"). See tests/gakuchika/test_gakuchika_flow_evaluators.py::
    # test_evaluate_deepdive_completion_rejects_keyword_only_shallow_followup
    has_uncertainty = _contains_any(combined, UNCERTAINTY_MARKERS)
    has_shallow_reason = _contains_any(combined, SHALLOW_REASON_HEDGES)
    has_concrete_learning = _contains_any(combined, LEARNING_CONCRETE_PATTERNS)
    has_wish_only_learning = (
        _contains_any(combined, LEARNING_WISH_ONLY_PATTERNS) and not has_concrete_learning
    )
    has_digit_result = _contains_digit(combined) and not has_uncertainty

    completed_checks = {
        "role_confirmed": (not role_needed) or _contains_any(combined, ROLE_CLARITY_PATTERNS),
        "challenge_confirmed": _contains_any(combined, TASK_PATTERNS) and _contains_any(combined, CONNECTIVE_PATTERNS),
        "action_reason_confirmed": (
            _contains_any(combined, ACTION_REASON_PATTERNS)
            and not has_shallow_reason
            and not has_uncertainty
        ),
        "result_evidence_confirmed": has_digit_result or _contains_any(combined, RESULT_SOFT_MARKERS),
        "learning_transfer_confirmed": (
            has_concrete_learning
            or (_contains_any(combined, LEARNING_TRANSFER_PATTERNS) and not has_wish_only_learning)
        ),
        "credibility_confirmed": (
            ((not role_needed) or _contains_any(combined, ROLE_CLARITY_PATTERNS))
            and not _contains_any(combined, _CREDIBILITY_RISK_MARKERS)
        ),
    }
    missing_reasons: list[str] = []
    if not completed_checks["role_confirmed"]:
        missing_reasons.append("role_scope_missing")
    if not completed_checks["challenge_confirmed"]:
        missing_reasons.append("challenge_context_missing")
    if not completed_checks["action_reason_confirmed"]:
        missing_reasons.append("action_reason_missing")
    if not completed_checks["result_evidence_confirmed"]:
        missing_reasons.append("result_evidence_missing")
    if not completed_checks["learning_transfer_confirmed"]:
        missing_reasons.append("learning_transfer_missing")
    if not completed_checks["credibility_confirmed"]:
        missing_reasons.append("credibility_risk")
    complete = len(missing_reasons) == 0
    completion_reasons = [key for key, value in completed_checks.items() if value] if complete else []
    return {
        "complete": complete,
        "completion_checks": completed_checks,
        "missing_reasons": missing_reasons,
        "completion_reasons": completion_reasons,
        "focus_key": focus_key or "challenge",
    }
