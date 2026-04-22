from app.routers.interview import (
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
    _build_fallback_opening_payload,
    _build_feedback_prompt,
    _build_opening_prompt,
    _build_plan_prompt,
    _build_setup,
    _build_turn_prompt,
    _enrich_feedback_defaults,
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

    # Setup fields are embedded as values, not raw key names
    assert "biz_general" in prompt  # role_track value
    assert "standard_behavioral" in prompt  # interview_format value
    assert "fulltime" in prompt  # selection_type value
    assert "mid" in prompt  # interview_stage value
    assert "hr" in prompt  # interviewer_type value (in persona block)
    assert "standard" in prompt  # strictness_mode value
    assert "ゼミで消費者行動を分析した" in prompt  # academic_summary content
    assert "priority_topics" in prompt
    assert "opening_topic" in prompt
    assert "must_cover_topics" in prompt
    # A-2: strictness instructions are now concrete
    assert "標準モード" in prompt
    # A-3: interviewer persona is now defined
    assert "人事面接官ペルソナ" in prompt


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

    assert "面接計画" in prompt  # section header
    assert "interview_type" in prompt  # plan JSON content
    assert "opening_topic" in prompt
    assert "motivation_fit" in prompt
    assert "ゼミで消費者行動を分析した" in prompt  # academic_summary content
    # A-2/A-3: instructions are now included
    assert "標準モード" in prompt
    assert "人事面接官ペルソナ" in prompt


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
    assert "strict" in prompt  # strictness_mode value
    # A-2: strictness instructions are now concrete
    assert "厳しめモード" in prompt
    # A-4: format-specific instructions are now included
    assert "行動面接の質問生成ルール" in prompt


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


def test_case_fallback_opening_uses_catalog_and_stable_scenario_key() -> None:
    payload = InterviewStartRequest(
        company_name="SmartRetail",
        company_summary="小売企業向けに店舗運営を支援するサービスを展開。",
        motivation_summary="現場起点で事業改善したい。",
        gakuchika_summary="売店の導線改善で購買率を上げた。",
        academic_summary="消費者行動を分析した。",
        research_summary=None,
        es_summary="学園祭の販売企画を改善した。",
        selected_industry="小売",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="case",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
    )

    opening = _build_fallback_opening_payload(
        payload,
        {"opening_topic": "structured_thinking"},
        _build_setup(payload),
    )

    assert "ケース面接として" in opening["question"]
    assert "まず何から切り分けて考えますか" in opening["question"]
    assert opening["turn_meta"]["intent_key"].startswith("case_scenario:")


def test_turn_prompt_compacts_recent_question_memory_and_includes_technical_focus() -> None:
    payload = InterviewTurnRequest(
        company_name="Frontend Labs",
        company_summary="UI 基盤を提供する SaaS。",
        motivation_summary="UI 品質で事業価値を作りたい。",
        gakuchika_summary="学内サービスの UI を改善した。",
        academic_summary="HCI を学んだ。",
        research_summary=None,
        es_summary="アクセシビリティ改善経験がある。",
        selected_industry="IT",
        selected_role="フロントエンドエンジニア",
        role_track="frontend_engineer",
        interview_format="technical",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="line_manager",
        strictness_mode="standard",
        conversation_history=[
            {"role": "assistant", "content": "最近扱った UI 課題は何ですか。"},
            {"role": "user", "content": "描画遅延の改善です。"},
        ],
        turn_state={
            "lastQuestion": "最近扱った UI 課題は何ですか。",
            "lastAnswer": "描画遅延の改善です。",
            "lastTopic": "technical_depth",
            "coveredTopics": [],
            "remainingTopics": ["tradeoff"],
            "coverageState": [],
            "formatPhase": "technical_main",
            "recentQuestionSummariesV2": [
                {
                    "intentKey": f"technical_depth:reason_check:{index}",
                    "normalizedSummary": f"summary-{index}",
                    "topic": "technical_depth",
                    "followupStyle": "reason_check",
                    "turnId": f"turn-{index}",
                }
                for index in range(14)
            ],
        },
    )

    prompt = _build_turn_prompt(
        payload,
        interview_plan={
            "interview_type": "new_grad_technical",
            "priority_topics": ["technical_depth"],
            "opening_topic": "technical_depth",
            "must_cover_topics": ["technical_depth", "tradeoff", "reproducibility"],
            "risk_topics": ["credibility_check"],
            "suggested_timeflow": ["導入", "技術判断", "前提とトレードオフ", "締め"],
        },
        turn_state=payload.turn_state,
        turn_meta={
            "topic": "technical_depth",
            "turn_action": "deepen",
            "focus_reason": "設計判断を深掘りするため",
            "depth_focus": "logic",
            "followup_style": "reason_check",
            "should_move_next": False,
        },
    )

    assert "描画性能" in prompt
    assert "summary-13" in prompt
    assert "summary-0" not in prompt


def test_feedback_defaults_personalize_improved_answer() -> None:
    payload = InterviewStartRequest(
        company_name="任天堂",
        company_summary="ゲームとIPで世界展開する企業。",
        motivation_summary="IPの長期価値を生かす事業に携わりたい。",
        gakuchika_summary="塾アルバイトで運営改善の仕組みを作った。",
        academic_summary="ゼミで消費者行動を分析した。",
        research_summary=None,
        es_summary="学生団体で企画を改善した経験がある。",
        selected_industry="メーカー",
        selected_role="企画",
        role_track="biz_general",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
    )

    feedback = _enrich_feedback_defaults(
        {
            "overall_comment": "",
            "scores": {"logic": 2, "specificity": 3, "consistency": 4},
            "strengths": [],
            "improvements": [],
            "consistency_risks": [],
            "weakest_question_type": "motivation",
            "weakest_question_snapshot": "なぜ当社を志望するのですか。",
            "weakest_answer_snapshot": "IP 事業に魅力を感じたからです。",
            "improved_answer": "",
            "next_preparation": [],
        },
        setup=_build_setup(payload),
        company_name=payload.company_name,
    )

    assert feedback["improved_answer"]
    assert "任天堂" in feedback["improved_answer"]
    assert "企画" in feedback["improved_answer"]
