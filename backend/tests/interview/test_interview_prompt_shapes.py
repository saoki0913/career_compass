from app.routers.interview import (
    InterviewFeedbackRequest,
    InterviewStartRequest,
    _build_feedback_prompt,
    _build_question_prompt,
)


def test_build_question_prompt_includes_company_stage_and_materials() -> None:
    payload = InterviewStartRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        motivation_summary="IPの長期価値を生かす事業に携わりたい。",
        gakuchika_summary="塾アルバイトで運営改善の仕組みを作った。",
        es_summary="学生団体で企画を改善した経験がある。",
    )

    prompt = _build_question_prompt(payload, question_index=1, conversation_text="まだ会話なし")

    assert "任天堂" in prompt
    assert "ゲームとIPで世界展開する企業。" in prompt
    assert "志望動機" in prompt
    assert "ガクチカ" in prompt
    assert "ES" in prompt
    assert "current_stage: opening" in prompt
    assert "導入として話しやすい入口を作り" in prompt


def test_build_feedback_prompt_requires_structured_feedback() -> None:
    payload = InterviewFeedbackRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        conversation_history=[
            {"role": "assistant", "content": "自己紹介をしてください。"},
            {"role": "user", "content": "学生時代は塾で運営改善に取り組みました。"},
        ],
    )

    prompt = _build_feedback_prompt(
        payload,
        conversation_text="面接官: 自己紹介をしてください。\n応募者: 学生時代は塾で...",
    )

    assert "企業適合" in prompt
    assert "具体性" in prompt
    assert "論理性" in prompt
    assert "説得力" in prompt
    assert "improved_answer" in prompt
    assert "preparation_points" in prompt
