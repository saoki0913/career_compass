"""
Motivation conversation-context normalization and slot-state helpers.

Pure Python module -- no FastAPI, no async, no external app imports beyond stdlib.
All functions here are deterministic transformations used to normalise,
classify, and update the ``conversationContext`` dict that flows between the
front-end and the motivation router.
"""

from __future__ import annotations

import re
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

STAGE_LABELS = {
    "industry_reason": "業界志望理由",
    "company_reason": "企業志望理由",
    "self_connection": "自分との接続",
    "desired_work": "やりたい仕事",
    "value_contribution": "価値発揮",
    "differentiation": "差別化",
}

SLOT_STATE_ORDER = ("missing", "partial", "filled_weak", "filled_strong")
SLOT_STATE_ELIGIBLE_FOR_ASK = {"missing", "partial", "filled_weak"}
MAX_WEAK_SLOT_REASKS = 1

REQUIRED_MOTIVATION_STAGES = (
    "industry_reason",
    "company_reason",
    "self_connection",
    "desired_work",
    "value_contribution",
    "differentiation",
)

STAGE_CONFIRMED_FACT_KEYS = {
    "industry_reason": "industry_reason_confirmed",
    "company_reason": "company_reason_confirmed",
    "self_connection": "self_connection_confirmed",
    "desired_work": "desired_work_confirmed",
    "value_contribution": "value_contribution_confirmed",
    "differentiation": "differentiation_confirmed",
}

CONVERSATION_MODE_SLOT_FILL = "slot_fill"
CONVERSATION_MODE_DEEPDIVE = "deepdive"
SLOT_STATE_VALUES = ("empty", "rough", "sufficient", "locked")

SLOT_FILL_INTENTS: dict[str, str] = {
    "industry_reason": "initial_capture",
    "company_reason": "initial_capture",
    "self_connection": "initial_capture",
    "desired_work": "initial_capture",
    "value_contribution": "initial_capture",
    "differentiation": "initial_capture",
}

UNRESOLVED_PATTERNS = (
    "まだ整理できていない",
    "まだ決めきれていない",
    "まだ言語化できていない",
    "わからない",
    "まだわからない",
    # E-1 / P3-3: 追加パターン（迷い・漠然とした未整理表現）
    "正直よくわからない",
    "あまりピンと来ない",
    "まだ漠然と",
    "考え中",
)

CONTRADICTION_PATTERNS = (
    "ではなく",
    "むしろ",
    "違って",
    "やっぱり",
    "訂正すると",
    "まだ決めていない",
    # E-1 / P3-3: 追加パターン（前回回答の撤回・考え直し）
    "前の答えは違って",
    "さっきのは撤回",
    "実は",
    "考え直すと",
)

COMPANY_GENERIC_PATTERNS = (
    "社会課題を解決",
    "成長できる",
    "学べる",
    "幅広く活躍",
    "挑戦できる",
)

CONTRIBUTION_TARGET_TOKENS = ("相手", "顧客", "現場", "企業", "組織", "チーム")
CONTRIBUTION_ACTION_TOKENS = ("整理", "提案", "支援", "改善", "推進", "巻き込")
CONTRIBUTION_VALUE_TOKENS = ("価値", "貢献", "役立", "前に進", "実現", "判断")

COMPANY_TEXT_NOISE_PATTERNS = (
    re.compile(r"^[QＱ]\s*\d+\b", re.IGNORECASE),
    re.compile(r"^(見出し|質問|回答)[:：]"),
    re.compile(r"^https?://", re.IGNORECASE),
)

COMPANY_TEXT_NOISE_KEYWORDS = (
    "ご紹介します",
    "エントリー",
    "マイページ",
    "募集要項",
    "選考フロー",
    "選考情報",
    "応募方法",
    "応募する",
    "よくある質問",
    "FAQ",
    "ニュース",
    "トピックス",
    "一覧",
    "詳細はこちら",
    "クリック",
    "社員紹介",
    "採用情報",
    "インターンシップ",
    "見出し",
    "Q1",
    "Q2",
    "Q3",
    "Q4",
)

# ---------------------------------------------------------------------------
# Default generator functions
# ---------------------------------------------------------------------------


def _default_slot_states() -> dict[str, str]:
    return {
        stage: "empty"
        for stage in REQUIRED_MOTIVATION_STAGES
    }


def _default_slot_summaries() -> dict[str, str | None]:
    return {
        stage: None
        for stage in REQUIRED_MOTIVATION_STAGES
    }


def _default_slot_evidence_sentences() -> dict[str, list[str]]:
    return {
        stage: []
        for stage in REQUIRED_MOTIVATION_STAGES
    }


def _default_slot_intents_asked() -> dict[str, list[str]]:
    return {
        stage: []
        for stage in REQUIRED_MOTIVATION_STAGES
    }


def _default_reask_budget_by_slot() -> dict[str, int]:
    return {
        stage: 1
        for stage in REQUIRED_MOTIVATION_STAGES
    }


def _clean_short_phrase(text: str, max_len: int = 40) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip(" ・-:：")
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


def _coerce_string_list(value: Any, max_items: int = 4) -> list[str]:
    if not isinstance(value, list):
        return []
    output: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        cleaned = _clean_short_phrase(item, max_len=48)
        if cleaned and cleaned not in output:
            output.append(cleaned)
        if len(output) >= max_items:
            break
    return output


def _default_confirmed_facts() -> dict[str, bool]:
    return {
        "industry_reason_confirmed": False,
        "company_reason_confirmed": False,
        "self_connection_confirmed": False,
        "desired_work_confirmed": False,
        "value_contribution_confirmed": False,
        "differentiation_confirmed": False,
    }


def _default_weak_slot_retries() -> dict[str, int]:
    return {stage: 0 for stage in REQUIRED_MOTIVATION_STAGES}


# ---------------------------------------------------------------------------
# Normalization functions
# ---------------------------------------------------------------------------


def _normalize_weak_slot_retries(value: Any) -> dict[str, int]:
    defaults = _default_weak_slot_retries()
    if not isinstance(value, dict):
        return defaults
    normalized = defaults.copy()
    for stage in defaults:
        try:
            normalized[stage] = max(int(value.get(stage) or 0), 0)
        except (TypeError, ValueError):
            normalized[stage] = 0
    return normalized


def _normalize_slot_state(value: Any) -> str:
    raw = str(value or "").strip()
    if raw == "filled":
        return "filled_strong"
    if raw in SLOT_STATE_ORDER:
        return raw
    return "missing"


def _legacy_slot_state(value: str) -> str:
    normalized = _normalize_slot_state(value)
    if normalized in {"filled_strong", "filled_weak"}:
        return "filled"
    return normalized


def _normalize_slot_status_v2(value: Any) -> dict[str, str]:
    statuses = {
        stage: "missing"
        for stage in REQUIRED_MOTIVATION_STAGES
    }
    if not isinstance(value, dict):
        return statuses
    for stage in statuses:
        statuses[stage] = _normalize_slot_state(value.get(stage))
    return statuses


def _normalize_slot_state_map(value: Any) -> dict[str, str]:
    states = _default_slot_states()
    if not isinstance(value, dict):
        return states
    for stage in states:
        raw = str(value.get(stage) or "").strip()
        if raw in SLOT_STATE_VALUES:
            states[stage] = raw
    return states


def _normalize_slot_summary_map(value: Any) -> dict[str, str | None]:
    summaries = _default_slot_summaries()
    if not isinstance(value, dict):
        return summaries
    for stage in summaries:
        raw = str(value.get(stage) or "").strip()
        summaries[stage] = raw or None
    return summaries


def _normalize_slot_evidence_map(value: Any) -> dict[str, list[str]]:
    evidence_map = _default_slot_evidence_sentences()
    if not isinstance(value, dict):
        return evidence_map
    for stage in evidence_map:
        evidence_map[stage] = _coerce_string_list(value.get(stage), max_items=4)
    return evidence_map


def _normalize_slot_intents_map(value: Any) -> dict[str, list[str]]:
    intents_map = _default_slot_intents_asked()
    if not isinstance(value, dict):
        return intents_map
    for stage in intents_map:
        intents_map[stage] = _coerce_string_list(value.get(stage), max_items=6)
    return intents_map


def _normalize_forbidden_reasks(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    rows: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        slot = str(item.get("slot") or "").strip()
        intent = str(item.get("intent") or "").strip()
        reason = str(item.get("reason") or "").strip()
        if slot not in REQUIRED_MOTIVATION_STAGES or not intent:
            continue
        rows.append({"slot": slot, "intent": intent, "reason": reason or "reask_forbidden"})
    return rows


def _normalize_causal_gaps(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    gaps: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        gap_id = str(item.get("id") or "").strip()
        slot = str(item.get("slot") or "").strip()
        reason = str(item.get("reason") or "").strip()
        prompt_hint = str(item.get("promptHint") or item.get("prompt_hint") or "").strip()
        if not gap_id or slot not in REQUIRED_MOTIVATION_STAGES:
            continue
        gaps.append(
            {
                "id": gap_id,
                "slot": slot,
                "reason": reason or gap_id,
                "promptHint": prompt_hint,
            }
        )
    return gaps


def _slot_priority(state: str) -> int:
    ranking = {"missing": 0, "partial": 1, "filled_weak": 2, "filled_strong": 3}
    return ranking.get(_normalize_slot_state(state), 0)


def _coerce_stage_list(value: Any, *, max_items: int = 8) -> list[str]:
    if not isinstance(value, list):
        return []
    output: list[str] = []
    for item in value:
        stage = str(item or "").strip()
        if stage in REQUIRED_MOTIVATION_STAGES and stage not in output:
            output.append(stage)
        if len(output) >= max_items:
            break
    return output


def _normalize_confirmed_facts(value: Any) -> dict[str, bool]:
    defaults = _default_confirmed_facts()
    if not isinstance(value, dict):
        return defaults
    normalized = defaults.copy()
    for key in defaults:
        if key in value:
            normalized[key] = bool(value[key])
    if "origin_experience_confirmed" in value:
        normalized["self_connection_confirmed"] = (
            normalized["self_connection_confirmed"] or bool(value["origin_experience_confirmed"])
        )
    if "fit_connection_confirmed" in value:
        normalized["self_connection_confirmed"] = (
            normalized["self_connection_confirmed"] or bool(value["fit_connection_confirmed"])
        )
    return normalized


def _build_open_slots_from_confirmed_facts(confirmed_facts: dict[str, bool]) -> list[str]:
    slots: list[str] = []
    for stage, key in STAGE_CONFIRMED_FACT_KEYS.items():
        if not confirmed_facts.get(key, False):
            slots.append(stage)
    return slots


def _confirmed_fact_key_for_stage(stage: str) -> str | None:
    return STAGE_CONFIRMED_FACT_KEYS.get(stage)


def _answer_is_confirmed_for_stage(stage: str, answer: str) -> bool:
    normalized = " ".join((answer or "").split()).strip()
    if len(normalized) < 10:
        return False
    if stage == "industry_reason":
        return len(normalized) >= 18 and any(
            token in normalized for token in ("業界", "関心", "理由", "ため", "から", "惹かれ")
        )
    if stage == "company_reason":
        return len(normalized) >= 18 and any(
            token in normalized for token in ("理由", "ため", "から", "惹かれ", "魅力", "合う")
        )
    if stage == "self_connection":
        return len(normalized) >= 18 and any(
            token in normalized for token in ("経験", "価値観", "強み", "きっかけ", "つなが", "活か")
        )
    if stage == "desired_work":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("したい", "挑戦", "関わりたい", "担いたい", "取り組みたい")
        )
    if stage == "value_contribution":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("価値", "貢献", "役立", "前に進め", "支え", "実現")
        )
    if stage == "differentiation":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("他社", "違い", "だからこそ", "最も", "ならでは", "合う")
        )
    return bool(normalized)


def _coerce_risk_flags(value: Any, max_items: int = 2) -> list[str]:
    return _coerce_string_list(value, max_items=max_items)


# ---------------------------------------------------------------------------
# Company text helpers
# ---------------------------------------------------------------------------


def _is_noisy_company_text(text: str) -> bool:
    cleaned = " ".join((text or "").split())
    if len(cleaned) < 4:
        return True
    if any(pattern.search(cleaned) for pattern in COMPANY_TEXT_NOISE_PATTERNS):
        return True
    if any(keyword in cleaned for keyword in COMPANY_TEXT_NOISE_KEYWORDS):
        return True
    if "?" in cleaned or "？" in cleaned:
        return True
    if any(token in cleaned for token in ("|", ">", "＞", "http://", "https://")):
        return True
    return False


def _sanitize_existing_grounding_candidates(
    values: list[str] | None,
    *,
    max_items: int = 4,
    max_len: int = 32,
) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned_values: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = _clean_short_phrase(value, max_len=max_len)
        if not cleaned or cleaned in cleaned_values:
            continue
        if _is_noisy_company_text(cleaned):
            continue
        cleaned_values.append(cleaned)
        if len(cleaned_values) >= max_items:
            break
    return cleaned_values


# ---------------------------------------------------------------------------
# The big normalization function
# ---------------------------------------------------------------------------


def _normalize_conversation_context(value: dict[str, Any] | None) -> dict[str, Any]:
    context = value.copy() if isinstance(value, dict) else {}
    has_explicit_confirmed_facts = isinstance(context.get("confirmedFacts"), dict)
    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    weak_slot_retries = _normalize_weak_slot_retries(context.get("weakSlotRetries"))
    raw_stage_attempt_count = context.get("stageAttemptCount")
    try:
        stage_attempt_count = max(int(raw_stage_attempt_count or 0), 0)
    except (TypeError, ValueError):
        stage_attempt_count = 0
    normalized = {
        "conversationMode": (
            str(context.get("conversationMode") or "").strip()
            if str(context.get("conversationMode") or "").strip() in {CONVERSATION_MODE_SLOT_FILL, CONVERSATION_MODE_DEEPDIVE}
            else CONVERSATION_MODE_SLOT_FILL
        ),
        "selectedIndustry": str(context.get("selectedIndustry") or "").strip() or None,
        "selectedIndustrySource": str(context.get("selectedIndustrySource") or "").strip() or None,
        "industryReason": str(context.get("industryReason") or "").strip() or None,
        "companyReason": str(context.get("companyReason") or "").strip() or None,
        "selectedRole": str(context.get("selectedRole") or "").strip() or None,
        "selectedRoleSource": str(context.get("selectedRoleSource") or "").strip() or None,
        "selfConnection": str(
            context.get("selfConnection")
            or context.get("fitConnection")
            or context.get("originExperience")
            or ""
        ).strip()
        or None,
        "desiredWork": str(context.get("desiredWork") or "").strip() or None,
        "valueContribution": str(context.get("valueContribution") or "").strip() or None,
        "differentiationReason": str(context.get("differentiationReason") or "").strip() or None,
        "originExperience": str(context.get("originExperience") or "").strip() or None,
        "fitConnection": str(context.get("fitConnection") or "").strip() or None,
        "userAnchorStrengths": _coerce_string_list(context.get("userAnchorStrengths"), max_items=4),
        "userAnchorEpisodes": _coerce_string_list(context.get("userAnchorEpisodes"), max_items=4),
        "profileAnchorIndustries": _coerce_string_list(context.get("profileAnchorIndustries"), max_items=4),
        "profileAnchorJobTypes": _coerce_string_list(context.get("profileAnchorJobTypes"), max_items=4),
        "companyAnchorKeywords": _sanitize_existing_grounding_candidates(
            context.get("companyAnchorKeywords"),
            max_items=6,
            max_len=32,
        ),
        "companyRoleCandidates": _coerce_string_list(context.get("companyRoleCandidates"), max_items=4),
        "companyWorkCandidates": _sanitize_existing_grounding_candidates(
            context.get("companyWorkCandidates"),
            max_items=4,
            max_len=32,
        ),
        "turnCount": max(int(context.get("turnCount") or 0), 0) if str(context.get("turnCount") or "0").strip().isdigit() else 0,
        "deepdiveTurnCount": max(int(context.get("deepdiveTurnCount") or 0), 0) if str(context.get("deepdiveTurnCount") or "0").strip().isdigit() else 0,
        "questionStage": (
            "self_connection"
            if str(context.get("questionStage") or "").strip() in {"origin_experience", "fit_connection"}
            else str(context.get("questionStage") or "").strip() or "industry_reason"
        ),
        "stageAttemptCount": stage_attempt_count,
        "lastQuestionSignature": str(context.get("lastQuestionSignature") or "").strip() or None,
        "lastQuestionSemanticSignature": str(context.get("lastQuestionSemanticSignature") or "").strip() or None,
        "confirmedFacts": confirmed_facts,
        "openSlots": _coerce_string_list(
            context.get("openSlots") or _build_open_slots_from_confirmed_facts(confirmed_facts),
            max_items=8,
        ),
        "closedSlots": _coerce_stage_list(context.get("closedSlots"), max_items=8),
        "recentlyClosedSlots": _coerce_stage_list(context.get("recentlyClosedSlots"), max_items=4),
        "weakSlotRetries": weak_slot_retries,
        "draftReady": bool(context.get("draftReady", False)),
        "draftReadyUnlockedAt": str(context.get("draftReadyUnlockedAt") or "").strip() or None,
        "lastQuestionMeta": context.get("lastQuestionMeta")
        if isinstance(context.get("lastQuestionMeta"), dict)
        else None,
        "generatedDraft": str(context.get("generatedDraft") or "").strip() or None,
        "slotStatusV2": _normalize_slot_status_v2(context.get("slotStatusV2")),
        "draftBlockers": _coerce_stage_list(context.get("draftBlockers"), max_items=8),
        "slotStates": _normalize_slot_state_map(context.get("slotStates")),
        "slotSummaries": _normalize_slot_summary_map(context.get("slotSummaries")),
        "slotEvidenceSentences": _normalize_slot_evidence_map(context.get("slotEvidenceSentences")),
        "slotIntentsAsked": _normalize_slot_intents_map(context.get("slotIntentsAsked")),
        "reaskBudgetBySlot": {
            **_default_reask_budget_by_slot(),
            **(
                {
                    stage: max(int(value), 0)
                    for stage, value in (context.get("reaskBudgetBySlot") or {}).items()
                    if stage in REQUIRED_MOTIVATION_STAGES
                }
                if isinstance(context.get("reaskBudgetBySlot"), dict)
                else {}
            ),
        },
        "forbiddenReasks": _normalize_forbidden_reasks(context.get("forbiddenReasks")),
        "unresolvedPoints": _coerce_string_list(context.get("unresolvedPoints"), max_items=8),
        "causalGaps": _normalize_causal_gaps(context.get("causalGaps")),
        "roleReason": str(context.get("roleReason") or "").strip() or None,
        "roleReasonState": (
            str(context.get("roleReasonState") or "").strip()
            if str(context.get("roleReasonState") or "").strip() in SLOT_STATE_VALUES
            else "empty"
        ),
        "unlockReason": str(context.get("unlockReason") or "").strip() or None,
        "currentIntent": str(context.get("currentIntent") or "").strip() or None,
        "nextAdvanceCondition": str(context.get("nextAdvanceCondition") or "").strip() or None,
        "postDraftAwaitingResume": bool(context.get("postDraftAwaitingResume", False)),
        "deepdiveResumeCount": int(context.get("deepdiveResumeCount", 0)),
    }
    if not has_explicit_confirmed_facts:
        if normalized["industryReason"]:
            confirmed_facts["industry_reason_confirmed"] = True
        if normalized["companyReason"]:
            confirmed_facts["company_reason_confirmed"] = True
        if normalized["selfConnection"]:
            confirmed_facts["self_connection_confirmed"] = True
        if normalized["desiredWork"]:
            confirmed_facts["desired_work_confirmed"] = True
        if normalized["valueContribution"]:
            confirmed_facts["value_contribution_confirmed"] = True
        if normalized["differentiationReason"]:
            confirmed_facts["differentiation_confirmed"] = True
        normalized["confirmedFacts"] = confirmed_facts
        normalized["openSlots"] = _build_open_slots_from_confirmed_facts(confirmed_facts)
    legacy_summary_map = {
        "industry_reason": normalized["industryReason"],
        "company_reason": normalized["companyReason"],
        "self_connection": normalized["selfConnection"],
        "desired_work": normalized["desiredWork"],
        "value_contribution": normalized["valueContribution"],
        "differentiation": normalized["differentiationReason"],
    }
    for stage, summary in legacy_summary_map.items():
        if summary and not normalized["slotSummaries"].get(stage):
            normalized["slotSummaries"][stage] = summary
    if not normalized["closedSlots"]:
        normalized["closedSlots"] = [
            stage for stage in REQUIRED_MOTIVATION_STAGES
            if normalized["confirmedFacts"].get(STAGE_CONFIRMED_FACT_KEYS[stage], False)
        ]
    return normalized


# ---------------------------------------------------------------------------
# Answer capture
# ---------------------------------------------------------------------------


def _capture_answer_into_context(
    conversation_context: dict[str, Any] | None,
    answer: str | None,
) -> dict[str, Any]:
    context = _normalize_conversation_context(conversation_context)
    trimmed = " ".join((answer or "").split()).strip()
    if not trimmed:
        return context

    stage = context.get("questionStage") or "industry_reason"
    if stage == "industry_reason":
        context["industryReason"] = trimmed
    elif stage == "company_reason":
        context["companyReason"] = trimmed
    elif stage == "self_connection":
        context["selfConnection"] = trimmed
        context["fitConnection"] = trimmed
    elif stage == "desired_work":
        context["desiredWork"] = trimmed
    elif stage == "value_contribution":
        context["valueContribution"] = trimmed
    elif stage == "differentiation":
        context["differentiationReason"] = trimmed

    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    fact_key = _confirmed_fact_key_for_stage(stage)
    if fact_key:
        is_confirmed = _answer_is_confirmed_for_stage(stage, trimmed)
        confirmed_facts[fact_key] = is_confirmed
        if stage == "self_connection":
            confirmed_facts["origin_experience_confirmed"] = is_confirmed
            confirmed_facts["fit_connection_confirmed"] = is_confirmed
    context["confirmedFacts"] = confirmed_facts
    context["openSlots"] = _build_open_slots_from_confirmed_facts(confirmed_facts)
    context["turnCount"] = max(int(context.get("turnCount") or 0) + 1, 0)
    if context.get("conversationMode") == CONVERSATION_MODE_DEEPDIVE:
        context["deepdiveTurnCount"] = max(int(context.get("deepdiveTurnCount") or 0) + 1, 0)
    context["slotSummaries"][stage] = trimmed
    existing_sentences = list(context["slotEvidenceSentences"].get(stage) or [])
    if trimmed not in existing_sentences:
        existing_sentences.append(trimmed)
    context["slotEvidenceSentences"][stage] = existing_sentences[:4]
    slot_state = _classify_slot_state(stage, trimmed, context)
    if stage == "desired_work":
        context["roleReason"] = trimmed if _looks_like_role_reason(trimmed, context) else context.get("roleReason")
        context["roleReasonState"] = (
            "sufficient" if context.get("roleReason") else "empty"
        )

    unresolved = _answer_signals_unresolved(trimmed)
    contradiction = _answer_signals_contradiction(trimmed)
    budget = _default_reask_budget_by_slot().get(stage, 1)
    if isinstance(context.get("reaskBudgetBySlot"), dict):
        try:
            budget = max(int(context["reaskBudgetBySlot"].get(stage, budget)), 0)
        except (TypeError, ValueError):
            budget = 0
    should_hold_slot = (unresolved or contradiction) and budget > 0
    context.setdefault("reaskBudgetBySlot", _default_reask_budget_by_slot())
    if should_hold_slot:
        context["slotStates"][stage] = slot_state
        context["unresolvedPoints"] = _coerce_string_list(
            [*context.get("unresolvedPoints", []), STAGE_LABELS.get(stage, stage)],
            max_items=8,
        )
        context["reaskBudgetBySlot"][stage] = budget - 1
    else:
        context["slotStates"][stage] = "locked"
        context["closedSlots"] = list({
            *(_coerce_stage_list(context.get("closedSlots"), max_items=8)),
            stage,
        })
        current_intent = str(context.get("currentIntent") or SLOT_FILL_INTENTS.get(stage, "initial_capture"))
        existing_forbidden = [row for row in context.get("forbiddenReasks", []) if row.get("slot") != stage or row.get("intent") != current_intent]
        existing_forbidden.append({"slot": stage, "intent": current_intent, "reason": "slot_locked"})
        context["forbiddenReasks"] = existing_forbidden
        intents = list(context["slotIntentsAsked"].get(stage) or [])
        if current_intent and current_intent not in intents:
            intents.append(current_intent)
        context["slotIntentsAsked"][stage] = intents[:6]

    return context


# ---------------------------------------------------------------------------
# Signal detection and slot classification
# ---------------------------------------------------------------------------


def _answer_signals_unresolved(answer: str) -> bool:
    normalized = " ".join((answer or "").split())
    return any(token in normalized for token in UNRESOLVED_PATTERNS)


def _answer_signals_contradiction(answer: str) -> bool:
    normalized = " ".join((answer or "").split())
    return any(token in normalized for token in CONTRADICTION_PATTERNS)


def _contains_any_token(text: str | None, tokens: tuple[str, ...]) -> bool:
    normalized = " ".join((text or "").split())
    return any(token in normalized for token in tokens)


def _count_matching_groups(text: str | None, token_groups: tuple[tuple[str, ...], ...]) -> int:
    normalized = " ".join((text or "").split())
    return sum(1 for group in token_groups if any(token in normalized for token in group))


def _has_company_specificity(answer: str | None, context: dict[str, Any]) -> bool:
    normalized = " ".join((answer or "").split())
    if not normalized:
        return False
    keywords = _sanitize_existing_grounding_candidates(
        context.get("companyAnchorKeywords"),
        max_items=6,
        max_len=32,
    )
    if any(keyword in normalized for keyword in keywords):
        return True
    if any(keyword in normalized for keyword in ("DX", "業務改革", "事業", "商材", "社風", "働き方", "顧客課題", "提案")):
        return True
    return not any(pattern in normalized for pattern in COMPANY_GENERIC_PATTERNS)


def _looks_like_role_reason(answer: str | None, context: dict[str, Any]) -> bool:
    normalized = " ".join((answer or "").split())
    selected_role = str(context.get("selectedRole") or "").strip()
    if selected_role and selected_role in normalized:
        return True
    return any(token in normalized for token in ("企画", "営業", "提案", "改善", "開発", "仕事", "役割"))


def _classify_slot_state(stage: str, answer: str, context: dict[str, Any] | None = None) -> str:
    normalized = " ".join((answer or "").split()).strip()
    ctx = _normalize_conversation_context(context) if context is not None else _normalize_conversation_context(None)
    if len(normalized) < 6:
        return "empty"
    if stage == "industry_reason":
        return "sufficient" if len(normalized) >= 14 and _contains_any_token(normalized, ("業界", "理由", "関心", "ため", "から", "惹かれ")) else "rough"
    if stage == "company_reason":
        return "sufficient" if len(normalized) >= 16 and _has_company_specificity(normalized, ctx) else "rough"
    if stage == "self_connection":
        has_anchor = _contains_any_token(normalized, ("経験", "価値観", "強み", "原体験", "学生時代"))
        has_link = _contains_any_token(normalized, ("つなが", "活か", "生か", "だからこそ", "土台"))
        return "sufficient" if has_anchor and has_link else "rough"
    if stage == "desired_work":
        has_work = _contains_any_token(normalized, ("入社後", "仕事", "挑戦", "関わ", "役割", "提案", "改善"))
        has_role = _looks_like_role_reason(normalized, ctx)
        return "sufficient" if has_work and has_role else "rough"
    if stage == "value_contribution":
        return (
            "sufficient"
            if _count_matching_groups(
                normalized,
                (
                    CONTRIBUTION_TARGET_TOKENS,
                    CONTRIBUTION_ACTION_TOKENS,
                    CONTRIBUTION_VALUE_TOKENS,
                ),
            )
            >= 2
            else "rough"
        )
    if stage == "differentiation":
        return "sufficient" if _contains_any_token(normalized, ("他社", "違い", "ならでは", "だからこそ", "最も")) or _has_company_specificity(normalized, ctx) else "rough"
    return "rough"
