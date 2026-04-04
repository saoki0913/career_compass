from app.routers.interview import (
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
    _build_feedback_prompt,
    _build_opening_prompt,
    _build_plan_prompt,
    _build_turn_prompt,
)


def test_build_plan_prompt_includes_new_setup_fields() -> None:
    payload = InterviewStartRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        motivation_summary="IPの長期価値を生かす事業に携わりたい。",
        gakuchika_summary="塾アルバイトで運営改善の仕組みを作った。",
        academic_summary="ゼミで消費者行動を分析した。",
        research_summary=None,
        es_summary="学生団体で企画を改善した経験がある。",
        selected_industry="メーカー（電機・機械）",
        selected_role="企画",
        selected_role_source="application_job_type",
        role_track="biz_general",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
        seed_summary="業界共通論点: ものづくり理解 / 企業固有論点: IP価値",
    )

    prompt = _build_plan_prompt(payload)

    assert "role_track" in prompt
    assert "interview_format" in prompt
    assert "selection_type" in prompt
    assert "interview_stage" in prompt
    assert "interviewer_type" in prompt
    assert "strictness_mode" in prompt
    assert "academic_summary" in prompt
    assert "priority_topics" in prompt
    assert "opening_topic" in prompt
    assert "must_cover_topics" in prompt


def test_build_opening_prompt_mentions_plan_and_setup() -> None:
    payload = InterviewStartRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        motivation_summary="IPの長期価値を生かす事業に携わりたい。",
        gakuchika_summary="塾アルバイトで運営改善の仕組みを作った。",
        academic_summary="ゼミで消費者行動を分析した。",
        research_summary=None,
        es_summary="学生団体で企画を改善した経験がある。",
        selected_industry="メーカー（電機・機械）",
        selected_role="企画",
        selected_role_source="application_job_type",
        role_track="biz_general",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
        seed_summary="業界共通論点: ものづくり理解 / 企業固有論点: IP価値",
    )

    prompt = _build_opening_prompt(
        payload,
        interview_plan={
            "interview_type": "new_grad_behavioral",
            "priority_topics": ["motivation_fit"],
            "opening_topic": "motivation_fit",
            "must_cover_topics": ["motivation_fit", "role_understanding"],
            "risk_topics": ["credibility_check"],
            "suggested_timeflow": ["導入", "志望動機", "企業理解", "締め"],
        },
    )

    assert "interview_plan" in prompt
    assert "opening_topic" in prompt
    assert "motivation_fit" in prompt
    assert "academic_summary" in prompt


def test_build_turn_prompt_mentions_depth_controls() -> None:
    payload = InterviewTurnRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        motivation_summary="IPの長期価値を生かす事業に携わりたい。",
        gakuchika_summary="塾アルバイトで運営改善の仕組みを作った。",
        academic_summary="ゼミで消費者行動を分析した。",
        research_summary=None,
        es_summary="学生団体で企画を改善した経験がある。",
        selected_industry="メーカー（電機・機械）",
        selected_role="企画",
        selected_role_source="application_job_type",
        role_track="biz_general",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="strict",
        seed_summary="業界共通論点: ものづくり理解 / 企業固有論点: IP価値",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "IPの継続価値に関心があります。"},
        ],
        turn_state={
            "currentStage": "opening",
            "totalQuestionCount": 1,
            "stageQuestionCounts": {
                "industry_reason": 0,
                "role_reason": 0,
                "opening": 1,
                "experience": 0,
                "company_understanding": 0,
                "motivation_fit": 0,
            },
            "completedStages": [],
            "lastQuestionFocus": "志望動機の核",
            "nextAction": "ask",
            "phase": "turn",
            "interviewPlan": {
                "interview_type": "new_grad_behavioral",
                "priority_topics": ["motivation_fit"],
                "opening_topic": "motivation_fit",
                "must_cover_topics": ["motivation_fit", "role_understanding"],
                "risk_topics": ["credibility_check"],
                "suggested_timeflow": ["導入", "志望動機", "企業理解", "締め"],
            },
        },
    )

    prompt = _build_turn_prompt(
        payload,
        interview_plan={
            "interview_type": "new_grad_behavioral",
            "priority_topics": ["motivation_fit"],
            "opening_topic": "motivation_fit",
            "must_cover_topics": ["motivation_fit", "role_understanding"],
            "risk_topics": ["credibility_check"],
            "suggested_timeflow": ["導入", "志望動機", "企業理解", "締め"],
        },
        turn_state={
            "currentStage": "opening",
            "totalQuestionCount": 1,
            "stageQuestionCounts": {
                "industry_reason": 0,
                "role_reason": 0,
                "opening": 1,
                "experience": 0,
                "company_understanding": 0,
                "motivation_fit": 0,
            },
            "completedStages": [],
            "lastQuestionFocus": "志望動機の核",
            "nextAction": "ask",
            "phase": "turn",
            "formatPhase": "case_main",
            "coveredTopics": ["motivation_fit"],
            "remainingTopics": ["role_understanding"],
            "coverageState": [
                {
                    "topic": "motivation_fit",
                    "status": "active",
                    "requiredChecklist": ["company_reason", "experience_link"],
                    "passedChecklistKeys": ["company_reason"],
                    "deterministicCoveragePassed": False,
                    "llmCoverageHint": "partial",
                    "deepeningCount": 1,
                    "lastCoveredTurnId": None,
                }
            ],
            "recentQuestionSummariesV2": [
                {
                    "intentKey": "motivation_fit:company_reason_check",
                    "normalizedSummary": "会社理由の深掘り",
                    "topic": "motivation_fit",
                    "followupStyle": "company_reason_check",
                    "turnId": "turn-1",
                }
            ],
        },
        turn_meta={
            "topic": "motivation_fit",
            "turn_action": "deepen",
            "focus_reason": "企業固有の志望理由を掘るため",
            "depth_focus": "company_fit",
            "followup_style": "company_reason_check",
            "should_move_next": False,
        },
    )

    assert "coveredTopics" in prompt
    assert "remainingTopics" in prompt
    assert "coverage_state" in prompt
    assert "recent_question_summaries_v2" in prompt
    assert "format_phase" in prompt
    assert "intent_key" in prompt
    assert "turn_meta" in prompt
    assert "followup_style" in prompt
    assert "strictness_mode" in prompt


def test_build_feedback_prompt_requests_weakest_turn_linkage() -> None:
    payload = InterviewFeedbackRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        motivation_summary="IPの長期価値を生かす事業に携わりたい。",
        gakuchika_summary="塾アルバイトで運営改善の仕組みを作った。",
        academic_summary="ゼミで消費者行動を分析した。",
        research_summary=None,
        es_summary="学生団体で企画を改善した経験がある。",
        selected_industry="メーカー（電機・機械）",
        selected_role="企画",
        selected_role_source="application_job_type",
        role_track="biz_general",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="final",
        interviewer_type="executive",
        strictness_mode="strict",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "IPの継続価値に関心があります。"},
        ],
        turn_state={
            "recentQuestionSummariesV2": [
                {
                    "intentKey": "motivation_fit:company_reason_check",
                    "normalizedSummary": "会社理由の深掘り",
                    "topic": "motivation_fit",
                    "followupStyle": "company_reason_check",
                    "turnId": "turn-1",
                }
            ]
        },
        turn_events=[
            {
                "turn_id": "turn-1",
                "question": "志望理由を教えてください。",
                "answer": "IPの継続価値に関心があります。",
                "topic": "motivation_fit",
                "coverage_checklist_snapshot": {
                    "missingChecklistKeys": ["company_compare", "decision_axis"],
                },
            }
        ],
    )

    prompt = _build_feedback_prompt(payload)

    assert "role_fit" in prompt
    assert "consistency" in prompt
    assert "credibility" in prompt
    assert "consistency_risks" in prompt
    assert "weakest_question_type" in prompt
    assert "weakest_turn_id" in prompt
    assert "weakest_question_snapshot" in prompt
    assert "weakest_answer_snapshot" in prompt
    assert "turn_events" in prompt
    assert "未充足 checklist" in prompt
    assert "next_preparation" in prompt
