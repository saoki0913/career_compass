"""
Motivation turn-planner and progress helpers.

Pure Python module -- no FastAPI, no async, no LLM dependencies.
Contains the deterministic logic that decides *what to ask next*
(slot_fill vs deepdive, target slot, intent) and builds progress
payloads for the API response.
"""

from __future__ import annotations

from typing import Any

from app.routers.motivation_context import (
    CONVERSATION_MODE_DEEPDIVE,
    CONVERSATION_MODE_SLOT_FILL,
    CONTRIBUTION_ACTION_TOKENS,
    CONTRIBUTION_TARGET_TOKENS,
    CONTRIBUTION_VALUE_TOKENS,
    REQUIRED_MOTIVATION_STAGES,
    SLOT_FILL_INTENTS,
    _contains_any_token,
    _count_matching_groups,
    _has_company_specificity,
    _looks_like_role_reason,
    _normalize_conversation_context,
    _normalize_slot_state_map,
)
from app.routers.motivation_models import DeepDiveGap

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# E-3 (P3-5): DeepDiveGap enum を gap_id の単一情報源にする。planner 側で
# 独自の文字列を散らすと E-3 で統一した意味が壊れるので、必ず `to_gap_id()` 経由で書く。
DEEPDIVE_INTENT_BY_GAP_ID = {
    DeepDiveGap.COMPANY_REASON.to_gap_id(): "specificity_check",
    DeepDiveGap.SELF_CONNECTION.to_gap_id(): "experience_anchor",
    DeepDiveGap.DESIRED_WORK.to_gap_id(): "role_reason_capture",
    DeepDiveGap.VALUE_CONTRIBUTION.to_gap_id(): "contribution_shape",
    DeepDiveGap.DIFFERENTIATION.to_gap_id(): "compare_or_unique_point",
}

NEXT_ADVANCE_CONDITION_BY_SLOT = {
    "industry_reason": "その業界を選ぶ理由が1つ言えれば次に進みます。",
    "company_reason": "この企業を志望する理由が1つ言えれば次に進みます。",
    "self_connection": "自分の経験や価値観との接点が1つ言えれば次に進みます。",
    "desired_work": "入社後にやりたい仕事が1つ言えれば次に進みます。",
    "value_contribution": "どんな価値を出したいかが1つ言えれば次に進みます。",
    "differentiation": "他社ではなくこの企業を選ぶ理由が1つ言えればESに進めます。",
}

# ---------------------------------------------------------------------------
# Functions
# ---------------------------------------------------------------------------


def _compute_deterministic_causal_gaps(context: dict[str, Any] | None) -> list[dict[str, str]]:
    normalized = _normalize_conversation_context(context)
    gaps: list[dict[str, str]] = []
    company_reason = normalized.get("slotSummaries", {}).get("company_reason") or normalized.get("companyReason")
    self_connection = normalized.get("slotSummaries", {}).get("self_connection") or normalized.get("selfConnection")
    desired_work = normalized.get("slotSummaries", {}).get("desired_work") or normalized.get("desiredWork")
    value_contribution = normalized.get("slotSummaries", {}).get("value_contribution") or normalized.get("valueContribution")
    differentiation = normalized.get("slotSummaries", {}).get("differentiation") or normalized.get("differentiationReason")

    # E-3 (P3-5): gap_id / slot を DeepDiveGap 経由で生成して `_deepdive_area_to_*`
    # や `DEEPDIVE_INTENT_BY_GAP_ID` と整合させる
    if company_reason and not _has_company_specificity(company_reason, normalized):
        gaps.append({
            "id": DeepDiveGap.COMPANY_REASON.to_gap_id(),
            "slot": DeepDiveGap.COMPANY_REASON.to_stage(),
            "reason": "企業固有語が不足している",
            "promptHint": "企業のどの特徴や仕事のどこに惹かれたかを具体化する",
        })
    if self_connection and not _contains_any_token(self_connection, ("経験", "価値観", "強み")):
        gaps.append({
            "id": DeepDiveGap.SELF_CONNECTION.to_gap_id(),
            "slot": DeepDiveGap.SELF_CONNECTION.to_stage(),
            "reason": "経験との接続が弱い",
            "promptHint": "過去の経験や価値観とのつながりを補う",
        })
    if normalized.get("selectedRole") and not _looks_like_role_reason(normalized.get("roleReason") or desired_work, normalized):
        gaps.append({
            "id": DeepDiveGap.DESIRED_WORK.to_gap_id(),
            "slot": DeepDiveGap.DESIRED_WORK.to_stage(),
            "reason": "職種志望理由が不足している",
            "promptHint": "なぜその職種で働きたいかを補う",
        })
    if value_contribution and _count_matching_groups(
        value_contribution,
        (
            CONTRIBUTION_TARGET_TOKENS,
            CONTRIBUTION_ACTION_TOKENS,
            CONTRIBUTION_VALUE_TOKENS,
        ),
    ) < 2:
        gaps.append({
            "id": DeepDiveGap.VALUE_CONTRIBUTION.to_gap_id(),
            "slot": DeepDiveGap.VALUE_CONTRIBUTION.to_stage(),
            "reason": "価値発揮が理想論に寄っている",
            "promptHint": "誰にどう価値を出したいかを補う",
        })
    if not differentiation or not _contains_any_token(differentiation, ("他社", "違い", "ならでは", "だからこそ", "最も")):
        gaps.append({
            "id": DeepDiveGap.DIFFERENTIATION.to_gap_id(),
            "slot": DeepDiveGap.DIFFERENTIATION.to_stage(),
            "reason": "他社との差分が弱い",
            "promptHint": "他社ではなくこの企業を選ぶ理由を補う",
        })
    return gaps


def _determine_next_turn(context: dict[str, Any] | None) -> dict[str, Any]:
    normalized = _normalize_conversation_context(context)
    mode = normalized.get("conversationMode") or CONVERSATION_MODE_SLOT_FILL
    if mode == CONVERSATION_MODE_DEEPDIVE:
        gaps = normalized.get("causalGaps") or _compute_deterministic_causal_gaps(normalized)
        if int(normalized.get("deepdiveTurnCount") or 0) >= 10 or not gaps:
            return {
                "mode": CONVERSATION_MODE_DEEPDIVE,
                "unlock": True,
                "unlock_reason": "deepdive_complete",
                "target_slot": None,
                "intent": None,
                "next_advance_condition": "必要な補強が終わったため、このまま仕上げに進めます。",
            }
        gap = gaps[0]
        return {
            "mode": CONVERSATION_MODE_DEEPDIVE,
            "unlock": False,
            "unlock_reason": None,
            "target_slot": gap["slot"],
            "intent": DEEPDIVE_INTENT_BY_GAP_ID.get(gap["id"], "specificity_check"),
            "next_advance_condition": gap.get("promptHint") or "弱い部分を1つ補えれば次に進みます。",
        }

    states = _normalize_slot_state_map(normalized.get("slotStates"))
    if all(states.get(stage) == "locked" for stage in REQUIRED_MOTIVATION_STAGES):
        return {
            "mode": CONVERSATION_MODE_SLOT_FILL,
            "unlock": True,
            "unlock_reason": "completed_six_slots",
            "target_slot": None,
            "intent": None,
            "next_advance_condition": "6項目の材料が一通り揃ったのでESに進めます。",
        }
    if int(normalized.get("turnCount") or 0) >= 7:
        return {
            "mode": CONVERSATION_MODE_SLOT_FILL,
            "unlock": True,
            "unlock_reason": "max_turn_reached",
            "target_slot": None,
            "intent": None,
            "next_advance_condition": "一定回数まで確認したため、いったんESの作成に進めます。",
        }
    for stage in REQUIRED_MOTIVATION_STAGES:
        if states.get(stage) != "locked":
            return {
                "mode": CONVERSATION_MODE_SLOT_FILL,
                "unlock": False,
                "unlock_reason": None,
                "target_slot": stage,
                "intent": SLOT_FILL_INTENTS[stage],
                "next_advance_condition": NEXT_ADVANCE_CONDITION_BY_SLOT[stage],
            }
    return {
        "mode": CONVERSATION_MODE_SLOT_FILL,
        "unlock": True,
        "unlock_reason": "completed_six_slots",
        "target_slot": None,
        "intent": None,
        "next_advance_condition": "6項目の材料が一通り揃ったのでESに進めます。",
    }


def _build_progress_payload(
    context: dict[str, Any] | None,
    *,
    current_slot: str | None,
    current_intent: str | None,
    next_advance_condition: str | None,
) -> dict[str, Any]:
    normalized = _normalize_conversation_context(context)
    states = _normalize_slot_state_map(normalized.get("slotStates"))
    completed = sum(1 for state in states.values() if state == "locked")
    return {
        "completed": completed,
        "total": len(REQUIRED_MOTIVATION_STAGES),
        "current_slot": current_slot,
        "current_slot_label": _slot_label(current_slot) if current_slot else None,
        "current_intent": current_intent,
        "next_advance_condition": next_advance_condition,
        "mode": normalized.get("conversationMode") or CONVERSATION_MODE_SLOT_FILL,
    }


def _slot_label(slot: str) -> str:
    labels = {
        "industry_reason": "業界志望理由",
        "company_reason": "企業志望理由",
        "self_connection": "自分との接続",
        "desired_work": "やりたい仕事",
        "value_contribution": "価値発揮",
        "differentiation": "差別化",
    }
    return labels.get(slot, slot)
