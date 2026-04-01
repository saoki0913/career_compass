from app.routers.interview import (
    InterviewFeedbackRequest,
    InterviewStartRequest,
    _build_feedback_prompt,
    _build_question_prompt,
)


def test_build_question_prompt_includes_setup_and_seed_summary() -> None:
    payload = InterviewStartRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        motivation_summary="IPの長期価値を生かす事業に携わりたい。",
        gakuchika_summary="塾アルバイトで運営改善の仕組みを作った。",
        es_summary="学生団体で企画を改善した経験がある。",
        selected_industry="メーカー（電機・機械）",
        selected_role="企画",
        seed_summary="業界共通論点: ものづくり理解 / 企業固有論点: IP価値",
    )

    prompt = _build_question_prompt(
        payload,
        stage="industry_reason",
        turn_state={
            "currentStage": "industry_reason",
            "totalQuestionCount": 1,
            "stageQuestionCounts": {
                "industry_reason": 1,
                "role_reason": 0,
                "opening": 0,
                "experience": 0,
                "company_understanding": 0,
                "motivation_fit": 0,
            },
            "completedStages": [],
            "lastQuestionFocus": "業界志望の核",
            "nextAction": "ask",
        },
        focus="業界志望の核",
        transition_hint="",
        conversation_text="まだ会話なし",
    )

    assert "任天堂" in prompt
    assert "メーカー（電機・機械）" in prompt
    assert "企画" in prompt
    assert "seed_summary" in prompt
    assert "current_stage: industry_reason" in prompt


def test_build_feedback_prompt_requires_premise_consistency() -> None:
    payload = InterviewFeedbackRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        selected_industry="メーカー（電機・機械）",
        selected_role="企画",
        conversation_history=[
            {"role": "assistant", "content": "自己紹介をしてください。"},
            {"role": "user", "content": "学生時代は塾で運営改善に取り組みました。"},
        ],
    )

    prompt = _build_feedback_prompt(payload)

    assert "企業適合" in prompt
    assert "具体性" in prompt
    assert "論理性" in prompt
    assert "説得力" in prompt
    assert "premise_consistency" in prompt
    assert "preparation_points" in prompt
