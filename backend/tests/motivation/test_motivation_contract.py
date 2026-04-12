from app.routers.motivation_contract import build_stage_status, build_stream_complete_data
from app.routers.motivation_models import NextQuestionResponse


def test_build_stage_status_normalizes_self_connection_alias_and_pending_slots() -> None:
    stage_status = build_stage_status(
        {
            "slotStates": {
                "industry_reason": "locked",
                "company_reason": "locked",
                "self_connection": "rough",
                "desired_work": "empty",
                "value_contribution": "empty",
                "differentiation": "empty",
            }
        },
        "fit_connection",
    )

    assert stage_status.current == "self_connection"
    assert stage_status.completed == ["industry_reason", "company_reason"]
    assert "self_connection" not in stage_status.pending
    assert "desired_work" in stage_status.pending


def test_build_stream_complete_data_keeps_canonical_shape() -> None:
    payload = build_stream_complete_data(
        NextQuestionResponse(
            question="株式会社テストを志望先として考えるとき、どんな点に魅力を感じますか？",
            should_continue=True,
            suggested_end=False,
            draft_ready=False,
            evaluation={"ready_for_draft": False},
            target_slot="company_reason",
            question_intent="specificity_check",
            evidence_summary="質問の根拠: S1 recruitment: DX支援",
            evidence_cards=[],
            question_stage="company_reason",
            question_focus="company_reason",
            stage_status=None,
            captured_context={"questionStage": "company_reason"},
            coaching_focus="企業志望理由",
            risk_flags=["generic_company_reason"],
            question_signature="sig-1",
            semantic_question_signature="sem-1",
            stage_attempt_count=1,
            question_difficulty_level=2,
            candidate_validation_summary={"total_candidates": 0},
            weakness_tag=None,
            premise_mode="confirmed_only",
            conversation_mode="slot_fill",
            current_slot="company_reason",
            current_intent="specificity_check",
            next_advance_condition="この企業を志望する理由が1つ言えれば次に進みます。",
            progress={"completed": 2, "total": 6},
            causal_gaps=[{"id": "company_reason_specificity"}],
            internal_telemetry={"provider": "openai"},
        )
    )

    assert payload["question"] == "株式会社テストを志望先として考えるとき、どんな点に魅力を感じますか？"
    assert payload["stage_status"] == {}
    assert payload["conversation_mode"] == "slot_fill"
    assert payload["current_slot"] == "company_reason"
    assert "internal_telemetry" not in payload
