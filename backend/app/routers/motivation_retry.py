"""Retry and refinement helpers for motivation question/draft generation."""

from __future__ import annotations

import time
from typing import Any, Awaitable, Callable, Optional

from app.config import settings
from app.routers.es_review_retry import _build_ai_smell_retry_hints
from app.routers.es_review_validation import (
    _compute_ai_smell_score,
    _detect_ai_smell_patterns,
    _is_within_char_limits,
)
from app.utils.es_draft_text import normalize_es_draft_single_paragraph
from app.utils.llm import call_llm_with_error
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

QUESTION_FOCUSED_RETRY_CODES = frozenset(
    {
        "generic_blocklist",
        "multi_part",
        "too_long",
        "missing_keyword",
        "unconfirmed_premise",
        "duplicate_text",
        "duplicate_semantic",
    }
)


def _classify_question_failure_code(validation_report: dict[str, Any] | None) -> str | None:
    """Return the focused-retry failure code if the validation report is retryable."""
    if not isinstance(validation_report, dict):
        return None
    reason = str(validation_report.get("fallback_reason") or "").strip()
    if reason in QUESTION_FOCUSED_RETRY_CODES:
        return reason
    return None


def _build_question_retry_hint(
    failure_code: str,
    *,
    stage: str,
    company_name: str | None,
) -> str | None:
    """Map validation failure codes to focused question-regeneration hints."""
    stage_label_map = {
        "industry_reason": "業界志望理由",
        "company_reason": "企業志望理由",
        "self_connection": "自己接続",
        "desired_work": "やりたい仕事",
        "value_contribution": "価値発揮",
        "differentiation": "他社との差別化",
        "closing": "一言要約",
    }
    stage_label = stage_label_map.get(stage, stage)
    company_label = company_name or "この企業"
    mapping = {
        "generic_blocklist": (
            f"「もう少し詳しく」などの汎用表現を避け、{stage_label}に直結する具体的な1問にする"
        ),
        "multi_part": "論点を1つに絞り、質問は1文1論点で再生成する",
        "too_long": "質問を簡潔にし、前置きや説明を削って自然な1文に収める",
        "missing_keyword": (
            f"{stage_label}が分かる語を必ず含め、何を聞いているか明確にする"
        ),
        "unconfirmed_premise": (
            f"{company_label}や志望職種について未確認の前提を置かず、断定しない聞き方にする"
        ),
        "duplicate_text": "直前までの質問と表現を重ねず、切り口と言い回しを変える",
        "duplicate_semantic": "同じ意味の再質問を避け、別の角度から情報を引き出す",
    }
    return mapping.get(failure_code)


def _build_user_origin_from_conversation(
    conversation_history: list[Any],
    *,
    max_messages: int = 3,
    max_chars: int = 1200,
) -> str:
    """Join the latest user-authored messages in chronological order."""
    user_texts: list[str] = []
    for msg in reversed(conversation_history):
        role = getattr(msg, "role", None)
        content = getattr(msg, "content", None)
        if isinstance(msg, dict):
            role = msg.get("role")
            content = msg.get("content")
        if role != "user" or not isinstance(content, str):
            continue
        stripped = content.strip()
        if not stripped:
            continue
        user_texts.append(stripped)
        if len(user_texts) >= max_messages:
            break
    joined = "\n".join(reversed(user_texts))
    if len(joined) > max_chars:
        joined = joined[:max_chars]
    return joined


_CONCLUSION_KEYWORDS = ("志望", "したい", "魅力", "貢献", "惹か", "実現", "携わ")


def _extract_company_anchor_keywords(
    company_context: str,
    company_sources: list[dict[str, Any]] | None,
    evidence_cards: list[dict[str, Any]] | None,
    *,
    max_items: int = 5,
) -> list[str]:
    """Collect short company-specific anchors that should appear in the draft."""
    keywords: list[str] = []

    def _push(value: str | None) -> None:
        cleaned = str(value or "").strip()
        if (
            not cleaned
            or len(cleaned) < 2
            or len(cleaned) > 30
            or cleaned in keywords
        ):
            return
        keywords.append(cleaned)

    for card in evidence_cards or []:
        if not isinstance(card, dict):
            continue
        _push(card.get("title"))
        _push(card.get("theme"))
        _push(card.get("normalized_axis"))

    for source in company_sources or []:
        if not isinstance(source, dict):
            continue
        _push(source.get("title"))

    for token in (company_context or "").split():
        token = token.strip("、。()[]{}「」『』,.;:・")
        if len(token) >= 4 and any(ch.isupper() for ch in token):
            _push(token)
        if len(keywords) >= max_items:
            break

    return keywords[:max_items]


def _check_conclusion_first(draft_text: str, *, head_chars: int = 80) -> bool:
    """Return whether the draft starts with a conclusion-like motivation sentence."""
    if not draft_text:
        return False
    head = draft_text.replace("\n", "")[:head_chars]
    return any(kw in head for kw in _CONCLUSION_KEYWORDS)


def _build_multipass_refinement_hints(
    *,
    ai_smell_tier: int,
    ai_warnings: list[dict[str, Any]],
    needs_company_specificity: bool,
    anchor_keywords: list[str],
    needs_conclusion_first: bool,
) -> list[str]:
    """Build deterministic refinement hints for the multipass draft pass."""
    hints: list[str] = []
    if ai_smell_tier >= 2:
        hints.extend(_build_ai_smell_retry_hints(ai_warnings))
    if needs_company_specificity and anchor_keywords:
        kw_preview = "、".join(anchor_keywords[:3])
        hints.append(f"企業固有要素 ({kw_preview} 等) を本文中に具体的に織り込む")
    if needs_conclusion_first:
        hints.append("冒頭で「なぜこの企業か」の結論を述べてから経験・貢献を展開する")
    return hints


async def _apply_multipass_refinement(
    *,
    initial_draft: str,
    initial_smell_score: dict[str, Any],
    initial_within_limits: bool,
    company_context: str,
    company_sources: list[dict[str, Any]] | None,
    evidence_cards: list[dict[str, Any]] | None,
    user_origin_text: str,
    char_min: int,
    char_max: int,
    template_type: str,
    base_system_prompt: str,
    llm_call_fn,
    settings=settings,
) -> tuple[str, dict[str, Any]]:
    """Run one refinement pass for smell/company-specificity/opening issues."""
    telemetry: dict[str, Any] = {
        "refinement_attempted": False,
        "refinement_reasons": [],
        "refinement_adopted": False,
        "refinement_latency_ms": 0.0,
    }

    if not getattr(settings, "motivation_multipass_refinement", True):
        return initial_draft, telemetry

    ai_tier = int(initial_smell_score.get("tier", 0) or 0)
    needs_ai_smell = ai_tier >= 2
    anchor_keywords = _extract_company_anchor_keywords(
        company_context,
        company_sources,
        evidence_cards,
    )
    needs_company = bool(anchor_keywords) and not any(
        kw in initial_draft for kw in anchor_keywords
    )
    needs_conclusion = not _check_conclusion_first(initial_draft)

    reasons: list[str] = []
    if needs_ai_smell:
        reasons.append("ai_smell_tier_high")
    if needs_company:
        reasons.append("missing_company_specificity")
    if needs_conclusion:
        reasons.append("no_conclusion_first")
    if not reasons:
        return initial_draft, telemetry

    hints = _build_multipass_refinement_hints(
        ai_smell_tier=ai_tier,
        ai_warnings=list(initial_smell_score.get("warnings", []) or []),
        needs_company_specificity=needs_company,
        anchor_keywords=anchor_keywords,
        needs_conclusion_first=needs_conclusion,
    )
    if not hints:
        return initial_draft, telemetry

    telemetry["refinement_attempted"] = True
    telemetry["refinement_reasons"] = reasons
    refined_prompt = (
        base_system_prompt
        + "\n\n## 精錬指示\n"
        + "\n".join(f"- {hint}" for hint in hints)
    )

    started = time.monotonic()
    try:
        refined_draft = await llm_call_fn(refined_prompt)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[Motivation] multipass refinement failed: %s", exc)
        telemetry["refinement_latency_ms"] = (time.monotonic() - started) * 1000
        return initial_draft, telemetry
    telemetry["refinement_latency_ms"] = (time.monotonic() - started) * 1000

    if not refined_draft:
        return initial_draft, telemetry

    refined_within, _ = _is_within_char_limits(
        refined_draft,
        char_min=char_min,
        char_max=char_max,
    )
    if not refined_within and initial_within_limits:
        return initial_draft, telemetry

    refined_warnings = _detect_ai_smell_patterns(refined_draft, user_origin_text)
    refined_smell = _compute_ai_smell_score(
        refined_warnings,
        template_type=template_type,
        char_max=char_max,
    )
    initial_score = float(initial_smell_score.get("score", 0.0) or 0.0)
    refined_score = float(refined_smell.get("score", 0.0) or 0.0)
    if refined_score > initial_score + 0.3:
        return initial_draft, telemetry

    telemetry["refinement_adopted"] = True
    return refined_draft, telemetry


def _collect_draft_quality_failure_codes(
    *,
    draft_text: str,
    user_origin_text: str,
    template_type: str,
    char_min: int,
    char_max: int,
    anchor_keywords: list[str] | None = None,
) -> tuple[list[str], dict[str, Any], bool]:
    """Collect draft-quality failure codes with deterministic validation rules."""
    warnings = _detect_ai_smell_patterns(draft_text, user_origin_text)
    smell_score = _compute_ai_smell_score(
        warnings,
        template_type=template_type,
        char_max=char_max,
    )
    within_limits, detail = _is_within_char_limits(draft_text, char_min, char_max)
    failure_codes: list[str] = []
    if not within_limits:
        detail_text = str(detail or "")
        if detail_text.startswith("under_min"):
            failure_codes.append("under_char_min")
        elif detail_text.startswith("over_max"):
            failure_codes.append("over_char_max")
    if int(smell_score.get("tier", 0) or 0) >= 2:
        failure_codes.append("ai_smell_high")
    anchors = [kw for kw in (anchor_keywords or []) if kw]
    if anchors and not any(kw in draft_text for kw in anchors):
        failure_codes.append("missing_company_keywords")
    return failure_codes, smell_score, within_limits


def _build_draft_quality_retry_hints(
    *,
    failure_codes: list[str],
    ai_warnings: list[dict[str, Any]] | None = None,
    anchor_keywords: list[str] | None = None,
    char_min: int | None = None,
    char_max: int | None = None,
) -> list[str]:
    """Map draft-quality failure codes to deterministic retry hints."""
    hints: list[str] = []
    codes = list(dict.fromkeys(failure_codes))
    if "under_char_min" in codes and char_min:
        hints.append(f"内容を保ったまま情報密度を少し上げ、少なくとも{char_min}字以上にする")
    if "over_char_max" in codes and char_max:
        hints.append(f"冗長表現を削り、{char_max}字以内に収める")
    if "ai_smell_high" in codes:
        hints.extend(_build_ai_smell_retry_hints(list(ai_warnings or [])))
        if not ai_warnings:
            hints.append("抽象的な定型句を避け、元の言い回しと具体行動を優先する")
    if "missing_company_keywords" in codes and anchor_keywords:
        preview = "、".join(anchor_keywords[:3])
        hints.append(f"企業固有要素（{preview} など）を本文中に自然に含める")
    return list(dict.fromkeys(hints))


async def _maybe_retry_for_draft_quality(
    *,
    initial_draft: str,
    user_origin_text: str,
    template_type: str,
    char_min: int,
    char_max: int,
    anchor_keywords: list[str] | None,
    retry_prompt_builder: Callable[[list[str]], tuple[str, str]],
    llm_call_fn: Callable[[str, str], Awaitable[Optional[str]]],
) -> tuple[str, dict[str, Any], list[str], dict[str, Any]]:
    """Retry once for draft-quality issues and return the final accepted draft.

    Returns: ``(final_draft, smell_score, failure_codes, telemetry)``
    ``failure_codes`` is empty only when the returned draft satisfies validation.
    """
    initial_failure_codes, initial_smell_score, initial_within = _collect_draft_quality_failure_codes(
        draft_text=initial_draft,
        user_origin_text=user_origin_text,
        template_type=template_type,
        char_min=char_min,
        char_max=char_max,
        anchor_keywords=anchor_keywords,
    )
    if not initial_failure_codes:
        telemetry = {
            "quality_retry_attempted": False,
            "quality_retry_adopted": False,
            "quality_retry_failure_codes": [],
            "initial_within_limits": initial_within,
            "retry_within_limits": None,
        }
        return initial_draft, initial_smell_score, [], telemetry

    hints = _build_draft_quality_retry_hints(
        failure_codes=initial_failure_codes,
        ai_warnings=list(initial_smell_score.get("warnings", []) or []),
        anchor_keywords=anchor_keywords,
        char_min=char_min,
        char_max=char_max,
    )
    retry_system_prompt, retry_user_prompt = retry_prompt_builder(hints)
    retry_draft = await llm_call_fn(retry_system_prompt, retry_user_prompt)
    telemetry = {
        "quality_retry_attempted": True,
        "quality_retry_adopted": False,
        "quality_retry_failure_codes": initial_failure_codes,
        "initial_within_limits": initial_within,
        "retry_within_limits": None,
    }
    if not retry_draft:
        return initial_draft, initial_smell_score, initial_failure_codes, telemetry

    retry_failure_codes, retry_smell_score, retry_within = _collect_draft_quality_failure_codes(
        draft_text=retry_draft,
        user_origin_text=user_origin_text,
        template_type=template_type,
        char_min=char_min,
        char_max=char_max,
        anchor_keywords=anchor_keywords,
    )
    telemetry["retry_within_limits"] = retry_within
    if retry_failure_codes:
        return retry_draft, retry_smell_score, retry_failure_codes, telemetry

    telemetry["quality_retry_adopted"] = True
    telemetry["quality_retry_failure_codes"] = []
    return retry_draft, retry_smell_score, [], telemetry


def _select_motivation_draft(
    *,
    initial_draft: str,
    initial_smell_score: dict[str, Any],
    initial_within_limits: bool,
    retry_draft: Optional[str],
    retry_smell_score: Optional[dict[str, Any]],
    retry_within_limits: Optional[bool],
    char_min: int | None = None,
    char_max: int | None = None,
) -> tuple[str, str]:
    """Return the selected draft and selection reason."""
    _ = (char_min, char_max)
    if retry_draft is None or retry_smell_score is None or retry_within_limits is None:
        return initial_draft, "retry_failed"

    initial_score = float(initial_smell_score.get("score", 0.0))
    retry_score = float(retry_smell_score.get("score", 0.0))

    if initial_within_limits and retry_within_limits:
        if retry_score < initial_score:
            return retry_draft, "retry_better_score"
        return initial_draft, "initial_equal_or_better"
    if retry_within_limits and not initial_within_limits:
        return retry_draft, "retry_within_limits"
    if initial_within_limits and not retry_within_limits:
        return initial_draft, "initial_within_limits"
    return initial_draft, "both_out_of_limits"


async def _maybe_retry_for_ai_smell(
    *,
    initial_draft: str,
    user_origin_text: str,
    system_prompt: str,
    user_prompt: str,
    char_min: int,
    char_max: int,
    template_type: str = "company_motivation",
    max_tokens: int,
) -> tuple[str, str, dict[str, Any]]:
    """Retry once for AI-smell and deterministically choose the better draft."""
    initial_warnings = _detect_ai_smell_patterns(initial_draft, user_origin_text)
    initial_smell_score = _compute_ai_smell_score(
        initial_warnings,
        template_type=template_type,
        char_max=char_max,
    )
    initial_within, _ = _is_within_char_limits(initial_draft, char_min, char_max)

    tier = int(initial_smell_score.get("tier", 0) or 0)
    if tier < 2:
        telemetry = {
            "draft_selection_reason": "initial_only_no_retry",
            "ai_smell_score": float(initial_smell_score.get("score", 0.0)),
            "ai_smell_tier": tier,
            "retry_attempted": False,
            "initial_within_limits": initial_within,
            "retry_within_limits": None,
        }
        return initial_draft, "initial_only_no_retry", telemetry

    hints = _build_ai_smell_retry_hints(initial_warnings)
    retry_system_prompt = system_prompt
    if hints:
        retry_system_prompt = (
            system_prompt
            + "\n\n## AI臭修正指示\n"
            + "\n".join(f"- {hint}" for hint in hints)
        )

    retry_result = await call_llm_with_error(
        system_prompt=retry_system_prompt,
        user_message=user_prompt,
        max_tokens=max_tokens,
        temperature=0.35,
        feature="motivation_draft",
        retry_on_parse=True,
        disable_fallback=True,
    )

    retry_draft: Optional[str] = None
    retry_smell_score: Optional[dict[str, Any]] = None
    retry_within: Optional[bool] = None
    retry_llm_failed = not (retry_result.success and retry_result.data is not None)
    retry_empty_draft = False
    if not retry_llm_failed:
        raw_retry_draft = str(retry_result.data.get("draft", "")).strip()
        if raw_retry_draft:
            retry_draft = normalize_es_draft_single_paragraph(raw_retry_draft)
            retry_warnings = _detect_ai_smell_patterns(retry_draft, user_origin_text)
            retry_smell_score = _compute_ai_smell_score(
                retry_warnings,
                template_type=template_type,
                char_max=char_max,
            )
            retry_within, _ = _is_within_char_limits(retry_draft, char_min, char_max)
        else:
            retry_empty_draft = True

    if retry_draft is None:
        if retry_llm_failed:
            reason = "retry_llm_failed"
        elif retry_empty_draft:
            reason = "retry_empty_draft"
        else:
            reason = "retry_failed"
        final_draft = initial_draft
        chosen_smell = initial_smell_score
    else:
        final_draft, reason = _select_motivation_draft(
            initial_draft=initial_draft,
            initial_smell_score=initial_smell_score,
            initial_within_limits=initial_within,
            retry_draft=retry_draft,
            retry_smell_score=retry_smell_score,
            retry_within_limits=retry_within,
            char_min=char_min,
            char_max=char_max,
        )
        retry_adopted_reasons = {"retry_better_score", "retry_within_limits"}
        if reason in retry_adopted_reasons and retry_smell_score is not None:
            chosen_smell = retry_smell_score
        else:
            chosen_smell = initial_smell_score

    telemetry = {
        "draft_selection_reason": reason,
        "ai_smell_score": float(chosen_smell.get("score", 0.0)),
        "ai_smell_tier": int(chosen_smell.get("tier", 0) or 0),
        "retry_attempted": True,
        "initial_within_limits": initial_within,
        "retry_within_limits": retry_within,
        "retry_llm_failed": retry_llm_failed,
    }
    return final_draft, reason, telemetry


__all__ = [
    "_CONCLUSION_KEYWORDS",
    "_apply_multipass_refinement",
    "_build_draft_quality_retry_hints",
    "_build_multipass_refinement_hints",
    "_build_question_retry_hint",
    "_build_user_origin_from_conversation",
    "_classify_question_failure_code",
    "_check_conclusion_first",
    "_collect_draft_quality_failure_codes",
    "_extract_company_anchor_keywords",
    "_maybe_retry_for_ai_smell",
    "_maybe_retry_for_draft_quality",
    "_select_motivation_draft",
]
