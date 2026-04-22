import pytest

from app.routers.motivation import _build_draft_primary_material, _resolve_motivation_draft_metadata, _should_use_deepdive_mode
from app.routers.motivation_context import _classify_slot_state, _normalize_conversation_context
from app.routers.motivation_planner import (
    _build_progress_payload,
    _compute_deterministic_causal_gaps,
    _determine_next_turn,
)


def test_determine_next_turn_starts_from_industry_reason() -> None:
    context = _normalize_conversation_context(None)

    turn = _determine_next_turn(context)

    assert turn["mode"] == "slot_fill"
    assert turn["target_slot"] == "industry_reason"
    assert turn["intent"] == "initial_capture"
    assert turn["unlock"] is False


def test_determine_next_turn_unlocks_after_six_slots_are_locked() -> None:
    context = _normalize_conversation_context(
        {
            "conversationMode": "slot_fill",
            "turnCount": 6,
            "slotStates": {
                "industry_reason": "locked",
                "company_reason": "locked",
                "self_connection": "locked",
                "desired_work": "locked",
                "value_contribution": "locked",
                "differentiation": "locked",
            },
        }
    )

    turn = _determine_next_turn(context)

    assert turn["mode"] == "slot_fill"
    assert turn["unlock"] is True
    assert turn["unlock_reason"] == "completed_six_slots"


def test_determine_next_turn_uses_deepdive_gap_when_generated_draft_exists() -> None:
    context = _normalize_conversation_context(
        {
            "conversationMode": "deepdive",
            "draftReady": True,
            "generatedDraft": "志望動機の下書き",
            "deepdiveTurnCount": 1,
            "causalGaps": [
                {
                    "id": "company_reason_specificity",
                    "slot": "company_reason",
                    "reason": "企業固有語が不足している",
                    "promptHint": "企業のどの特徴に惹かれたかを具体化する",
                }
            ],
        }
    )

    turn = _determine_next_turn(context)

    assert turn["mode"] == "deepdive"
    assert turn["target_slot"] == "company_reason"
    assert turn["intent"] == "specificity_check"
    assert turn["unlock"] is False


@pytest.mark.parametrize(
    ("slot", "answer", "expected"),
    [
        ("industry_reason", "IT業界なら幅広い課題に関われるからです。", "sufficient"),
        ("company_reason", "社会課題を解決したいからです。", "rough"),
        ("self_connection", "学生団体で課題整理を続けた経験がつながると思います。", "sufficient"),
        ("desired_work", "入社後は企画職として顧客の課題整理に関わりたいです。", "sufficient"),
    ],
)
def test_classify_slot_state(slot: str, answer: str, expected: str) -> None:
    context = _normalize_conversation_context(
        {
            "selectedRole": "企画職",
            "companyAnchorKeywords": ["DX支援", "業務改革"],
        }
    )

    assert _classify_slot_state(slot, answer, context) == expected


def test_compute_deterministic_causal_gaps_flags_company_and_role_weakness() -> None:
    context = _normalize_conversation_context(
        {
            "companyReason": "社会課題を解決したいからです。",
            "desiredWork": "入社後は成長したいです。",
            "selfConnection": "学生時代に課題解決へ向き合いました。",
            "valueContribution": "価値を出したいです。",
            "differentiationReason": "",
            "slotSummaries": {
                "company_reason": "社会課題を解決したいからです。",
                "desired_work": "入社後は成長したいです。",
                "self_connection": "学生時代に課題解決へ向き合いました。",
                "value_contribution": "価値を出したいです。",
            },
            "selectedRole": "企画職",
        }
    )

    gaps = _compute_deterministic_causal_gaps(context)

    assert {gap["id"] for gap in gaps} >= {
        "company_reason_specificity",
        "role_reason_missing",
        "differentiation_missing",
    }


def test_build_progress_payload_reports_current_slot_and_completion() -> None:
    context = _normalize_conversation_context(
        {
            "conversationMode": "slot_fill",
            "slotStates": {
                "industry_reason": "locked",
                "company_reason": "locked",
                "self_connection": "locked",
                "desired_work": "empty",
                "value_contribution": "empty",
                "differentiation": "empty",
            },
        }
    )

    progress = _build_progress_payload(
        context,
        current_slot="desired_work",
        current_intent="initial_capture",
        next_advance_condition="入社後にやりたい仕事が1つ言えれば次に進みます。",
    )

    assert progress["completed"] == 3
    assert progress["total"] == 6
    assert progress["current_slot"] == "desired_work"


def test_should_use_deepdive_mode_requires_actual_generated_draft() -> None:
    class Prep:
        def __init__(self, was_draft_ready: bool, has_generated_draft: bool) -> None:
            self.was_draft_ready = was_draft_ready
            self.has_generated_draft = has_generated_draft

    assert _should_use_deepdive_mode(Prep(True, False)) is False
    assert _should_use_deepdive_mode(Prep(True, True)) is True


def test_build_draft_primary_material_prioritizes_structured_slots() -> None:
    heading, body = _build_draft_primary_material(
        conversation_text="質問: なぜその企業ですか？\n\n回答: DX支援の現場感に惹かれています。",
        slot_summaries={
            "company_reason": "DX支援の現場感に惹かれている。",
            "desired_work": "企画職として課題整理に関わりたい。",
        },
        slot_evidence_sentences={
            "company_reason": ["DX支援の現場感に惹かれている。"],
        },
    )

    assert heading == "【一次材料：骨格要約】"
    assert "【一次材料：骨格要約（優先的に反映すること）】" in body
    assert "企業志望理由" in body
    assert "根拠:" in body
    assert "【三次材料：会話ログ（補完用）】" in body


def test_resolve_motivation_draft_metadata_prefers_structured_slot_labels_and_company_context() -> None:
    key_points, company_keywords = _resolve_motivation_draft_metadata(
        slot_summaries={
            "company_reason": "DX支援の現場感に惹かれている。",
            "self_connection": "課題整理の経験がつながる。",
        },
        llm_key_points=["抽象的な表現", "企業理解"],
        llm_company_keywords=["抽象ワード"],
        company_context="DX支援を通じて顧客課題を解決する。業務改革の知見がある。",
        company_sources=[{"title": "業務改革", "excerpt": "DX支援の実績"}],
        selected_role="企画職",
    )

    assert key_points[:2] == ["企業理解", "自己接続"]
    assert "DX支援" in company_keywords


def test_resolve_motivation_draft_metadata_adds_experience_anchor_for_profile_route() -> None:
    key_points, company_keywords = _resolve_motivation_draft_metadata(
        slot_summaries=None,
        llm_key_points=[],
        llm_company_keywords=[],
        company_context="サプライチェーン最適化とデータ活用を推進する。",
        company_sources=None,
        selected_role="企画職",
        include_experience_anchor=True,
    )

    assert "自己接続" in key_points
    assert "やりたい仕事" in key_points
    assert company_keywords
