import json
from types import SimpleNamespace

import pytest

from app.routers.interview import (
    InterviewFeedbackRequest,
    INTERVIEW_CONTINUE_SCHEMA,
    INTERVIEW_FEEDBACK_SCHEMA,
    INTERVIEW_OPENING_SCHEMA,
    INTERVIEW_PLAN_SCHEMA,
    InterviewStartRequest,
    InterviewTurnRequest,
    INTERVIEW_TURN_SCHEMA,
    _collect_llm_completion,
    _generate_feedback_progress,
    _generate_start_progress,
    _generate_turn_progress,
    _normalize_feedback,
)


def _stream_event(payload: dict[str, object]) -> SimpleNamespace:
    return SimpleNamespace(
        type="complete",
        result=SimpleNamespace(success=True, data=payload, error=None),
    )


@pytest.mark.parametrize(
    ("schema", "required_fields"),
    [
        (
            INTERVIEW_PLAN_SCHEMA,
            {
                "interview_type",
                "priority_topics",
                "opening_topic",
                "must_cover_topics",
                "risk_topics",
                "suggested_timeflow",
            },
        ),
        (
            INTERVIEW_OPENING_SCHEMA,
            {"question", "question_stage", "focus", "interview_setup_note", "turn_meta"},
        ),
        (
            INTERVIEW_TURN_SCHEMA,
            {"question", "question_stage", "focus", "turn_meta", "plan_progress"},
        ),
        (
            INTERVIEW_CONTINUE_SCHEMA,
            {"question", "question_stage", "focus", "transition_line", "turn_meta"},
        ),
        (
            INTERVIEW_FEEDBACK_SCHEMA,
            {
                "overall_comment",
                "scores",
                "strengths",
                "improvements",
                "consistency_risks",
                "weakest_question_type",
                "improved_answer",
                "next_preparation",
                "premise_consistency",
            },
        ),
    ],
)
def test_interview_structured_output_schemas_require_expected_fields(
    schema: dict[str, object],
    required_fields: set[str],
) -> None:
    schema_body = schema["schema"]
    assert schema["name"].startswith("interview_")
    assert schema_body["type"] == "object"
    assert schema_body["additionalProperties"] is False
    assert required_fields.issubset(set(schema_body["required"]))


def test_normalize_feedback_preserves_weakest_turn_linkage_fields() -> None:
    normalized = _normalize_feedback(
        {
            "overall_comment": "総評",
            "scores": {"logic": 4},
            "strengths": ["構造化"],
            "improvements": ["他社比較"],
            "consistency_risks": ["将来像が浅い"],
            "weakest_question_type": "motivation",
            "weakest_turn_id": "turn-8",
            "weakest_question_snapshot": "なぜ当社なのですか。",
            "weakest_answer_snapshot": "事業に魅力を感じたからです。",
            "improved_answer": "改善回答",
            "next_preparation": ["比較軸の整理"],
            "premise_consistency": 81,
            "satisfaction_score": 5,
        }
    )

    assert normalized["weakest_turn_id"] == "turn-8"
    assert normalized["weakest_question_snapshot"] == "なぜ当社なのですか。"
    assert normalized["weakest_answer_snapshot"] == "事業に魅力を感じたからです。"
    assert normalized["satisfaction_score"] == 5


@pytest.mark.asyncio
async def test_collect_llm_completion_forwards_json_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    async def fake_stream(*args, **kwargs):
        seen.update(kwargs)
        yield _stream_event({"question": "自己紹介をお願いします。"})

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    data, string_chunks = await _collect_llm_completion(
        prompt="system",
        user_message="user",
        stream_string_fields=["question"],
        schema_hints={"question": "string"},
        max_tokens=700,
        temperature=0.2,
        feature="interview",
        json_schema=INTERVIEW_OPENING_SCHEMA,
    )

    assert data == {"question": "自己紹介をお願いします。"}
    assert string_chunks == []
    assert seen["response_format"] == "json_schema"
    assert seen["json_schema"] == INTERVIEW_OPENING_SCHEMA


@pytest.mark.asyncio
async def test_start_stream_emits_plan_before_opening_question(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_stream(*args, **kwargs):
        prompt = kwargs["system_prompt"]
        if "priority_topics" in prompt:
            yield _stream_event(
                {
                    "interview_type": "new_grad_behavioral",
                    "priority_topics": ["motivation_fit", "role_understanding"],
                    "opening_topic": "motivation_fit",
                    "must_cover_topics": ["motivation_fit", "role_understanding"],
                    "risk_topics": ["credibility_check"],
                    "suggested_timeflow": ["導入", "志望動機", "企業理解", "締め"],
                }
            )
            return

        yield SimpleNamespace(type="string_chunk", path="question", text="志望理由")
        yield _stream_event(
            {
                "question": "なぜこの企業を志望するのですか。",
                "question_stage": "opening",
                "focus": "志望動機の核",
                "turn_meta": {
                    "topic": "motivation_fit",
                    "turn_action": "ask",
                    "focus_reason": "初回導入",
                    "depth_focus": "company_fit",
                    "followup_style": "industry_reason_check",
                    "intent_key": "motivation_fit:industry_reason_check",
                    "should_move_next": False,
                },
            }
        )

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewStartRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        academic_summary="ゼミで消費者行動を分析した。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="standard",
    )

    events = []
    async for payload in _generate_start_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["question_stage"] == "opening"
    assert complete_event["data"]["interview_plan"]["opening_topic"] == "motivation_fit"
    assert complete_event["data"]["turn_state"]["formatPhase"] == "opening"
    assert complete_event["data"]["turn_state"]["coverageState"][0]["topic"] == "motivation_fit"
    assert complete_event["data"]["turn_state"]["turn_meta"]["turn_action"] in {"ask", "shift"}
    assert complete_event["data"]["turn_state"]["turn_meta"]["intent_key"].startswith("motivation_fit:")


@pytest.mark.asyncio
async def test_turn_stream_emits_turn_meta_and_updates_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_stream(*args, **kwargs):
        prompt = kwargs["system_prompt"]
        if "priority_topics" in prompt and "coveredTopics" in prompt:
            yield _stream_event(
                {
                    "question": "なぜその判断をしましたか。",
                    "question_stage": "turn",
                    "focus": "判断理由",
                    "turn_meta": {
                        "topic": "gakuchika_reproducibility",
                        "turn_action": "deepen",
                        "focus_reason": "意思決定を深掘りするため",
                        "depth_focus": "logic",
                        "followup_style": "reason_check",
                        "intent_key": "gakuchika_reproducibility:reason_check",
                        "should_move_next": False,
                    },
                    "plan_progress": {
                        "covered_topics": ["motivation_fit", "gakuchika_reproducibility"],
                        "remaining_topics": ["role_understanding"],
                    },
                }
            )
            return

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewTurnRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        academic_summary="ゼミで消費者行動を分析した。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="hr",
        strictness_mode="strict",
        conversation_history=[
            {"role": "assistant", "content": "学園祭での役割を教えてください。"},
            {"role": "user", "content": "進行管理を担当しました。"},
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
            "formatPhase": "standard_main",
            "coveredTopics": ["motivation_fit"],
            "remainingTopics": ["gakuchika_reproducibility", "role_understanding"],
            "coverageState": [
                {
                    "topic": "motivation_fit",
                    "status": "covered",
                    "requiredChecklist": ["company_reason"],
                    "passedChecklistKeys": ["company_reason"],
                    "deterministicCoveragePassed": True,
                    "llmCoverageHint": "strong",
                    "deepeningCount": 1,
                    "lastCoveredTurnId": "turn-1",
                },
                {
                    "topic": "gakuchika_reproducibility",
                    "status": "active",
                    "requiredChecklist": ["action", "result"],
                    "passedChecklistKeys": [],
                    "deterministicCoveragePassed": False,
                    "llmCoverageHint": None,
                    "deepeningCount": 0,
                    "lastCoveredTurnId": None,
                },
            ],
            "recentQuestionSummariesV2": [
                {
                    "intentKey": "motivation_fit:company_reason_check",
                    "normalizedSummary": "志望理由の深掘り",
                    "topic": "motivation_fit",
                    "followupStyle": "company_reason_check",
                    "turnId": "turn-1",
                }
            ],
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

    events = []
    async for payload in _generate_turn_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["question_stage"] == "turn"
    assert complete_event["data"]["turn_meta"]["followup_style"] == "reason_check"
    assert complete_event["data"]["turn_state"]["coveredTopics"] == ["motivation_fit"]
    assert complete_event["data"]["turn_state"]["remainingTopics"] == ["role_understanding"]
    assert complete_event["data"]["turn_state"]["formatPhase"] == "standard_main"
    assert complete_event["data"]["turn_state"]["turnMeta"]["intent_key"] == "gakuchika_reproducibility:reason_check"
    active_coverage = next(
        item
        for item in complete_event["data"]["turn_state"]["coverageState"]
        if item["topic"] == "gakuchika_reproducibility"
    )
    assert active_coverage["deterministicCoveragePassed"] is False
    assert active_coverage["llmCoverageHint"] == "covered"
    assert active_coverage["deepeningCount"] == 1


@pytest.mark.asyncio
async def test_feedback_stream_emits_seven_axis_scores_and_risks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_stream(*args, **kwargs):
        yield SimpleNamespace(type="string_chunk", path="overall_comment", text="企業理解が")
        yield SimpleNamespace(type="string_chunk", path="overall_comment", text="具体的でした。")
        yield _stream_event(
            {
                "overall_comment": "企業理解が具体的でした。",
                "scores": {
                    "company_fit": 4,
                    "role_fit": 4,
                    "specificity": 5,
                    "logic": 4,
                    "persuasiveness": 4,
                    "consistency": 3,
                    "credibility": 4,
                },
                "strengths": ["企業理解が具体的"],
                "improvements": ["結論を先に述べる"],
                "consistency_risks": ["他社比較が薄い"],
                "weakest_question_type": "company",
                "weakest_turn_id": "turn-1",
                "weakest_question_snapshot": "志望理由を教えてください。",
                "weakest_answer_snapshot": "顧客課題に近い立場で改善したいです。",
                "improved_answer": "結論から述べ、企業との接点を先に示します。",
                "next_preparation": ["志望理由の一言要約"],
            }
        )

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewFeedbackRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        academic_summary="ゼミで消費者行動を分析した。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="final",
        interviewer_type="executive",
        strictness_mode="strict",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "顧客課題に近い立場で改善したいです。"},
        ],
    )

    events = []
    async for payload in _generate_feedback_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["scores"]["role_fit"] == 4
    assert complete_event["data"]["scores"]["credibility"] == 4
    assert complete_event["data"]["consistency_risks"] == ["他社比較が薄い"]
    assert complete_event["data"]["weakest_question_type"] == "company"
    assert complete_event["data"]["weakest_turn_id"] == "turn-1"
    assert complete_event["data"]["turn_state"]["formatPhase"] == "feedback"


@pytest.mark.asyncio
async def test_start_stream_falls_back_when_llm_generation_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_collect(**kwargs):
        raise RuntimeError("LLM unavailable")

    monkeypatch.setattr("app.routers.interview._collect_llm_completion", fake_collect)

    request = InterviewStartRequest(
        company_name="ケース株式会社",
        company_summary="経営課題の解決を支援する企業。",
        motivation_summary="構造化して課題を考える仕事がしたい。",
        gakuchika_summary="学園祭の集客改善をした。",
        academic_summary="経営学を学んだ。",
        es_summary="分析と改善の経験がある。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="case",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="line_manager",
        strictness_mode="strict",
    )

    events = []
    async for payload in _generate_start_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert "売上が前年同期比で10%下がっている" in complete_event["data"]["question"]
    assert complete_event["data"]["turn_meta"]["topic"] in {"structured_thinking", "case_fit"}


@pytest.mark.asyncio
async def test_start_stream_replaces_format_mismatched_opening_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_stream(*args, **kwargs):
        prompt = kwargs["system_prompt"]
        if "最初の面接質問" not in prompt:
            yield _stream_event(
                {
                    "interview_type": "new_grad_case",
                    "priority_topics": ["case_fit", "structured_thinking"],
                    "opening_topic": "case_fit",
                    "must_cover_topics": ["case_fit", "structured_thinking"],
                    "risk_topics": ["credibility_check"],
                    "suggested_timeflow": ["導入", "論点整理", "打ち手", "締め"],
                }
            )
            return

        yield _stream_event(
            {
                "question": "なぜコンサルタントを志望しているのですか。",
                "question_stage": "opening",
                "focus": "志望動機",
                "turn_meta": {
                    "topic": "motivation_fit",
                    "turn_action": "ask",
                    "focus_reason": "初回導入",
                    "depth_focus": "company_fit",
                    "followup_style": "company_reason_check",
                    "should_move_next": False,
                },
            }
        )

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewStartRequest(
        company_name="ケース株式会社",
        company_summary="経営課題の解決を支援する企業。",
        motivation_summary="構造化して課題を考える仕事がしたい。",
        gakuchika_summary="学園祭の集客改善をした。",
        academic_summary="経営学を学んだ。",
        es_summary="分析と改善の経験がある。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="case",
        selection_type="fulltime",
        interview_stage="mid",
        interviewer_type="line_manager",
        strictness_mode="strict",
    )

    events = []
    async for payload in _generate_start_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert "売上が前年同期比で10%下がっている" in complete_event["data"]["question"]
    assert complete_event["data"]["turn_meta"]["topic"] in {"structured_thinking", "case_fit"}


@pytest.mark.asyncio
async def test_feedback_stream_backfills_missing_action_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_stream(*args, **kwargs):
        yield _stream_event(
            {
                "overall_comment": "全体像は見えています。",
                "scores": {
                    "company_fit": 3,
                    "role_fit": 4,
                    "specificity": 4,
                    "logic": 3,
                    "persuasiveness": 4,
                    "consistency": 3,
                    "credibility": 4,
                },
                "strengths": ["結論は明確"],
                "improvements": [],
                "consistency_risks": [],
                "weakest_question_type": "motivation",
                "improved_answer": "",
                "next_preparation": [],
            }
        )

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewFeedbackRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        academic_summary="ゼミで消費者行動を分析した。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        role_track="consulting",
        interview_format="standard_behavioral",
        selection_type="fulltime",
        interview_stage="final",
        interviewer_type="executive",
        strictness_mode="strict",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "顧客課題に近い立場で改善したいです。"},
        ],
    )

    events = []
    async for payload in _generate_feedback_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["improvements"]
    assert complete_event["data"]["next_preparation"]
    assert complete_event["data"]["improved_answer"]
    assert complete_event["data"]["weakest_turn_id"] == "turn-1"
    assert complete_event["data"]["weakest_question_snapshot"] == "志望理由を教えてください。"
    assert complete_event["data"]["weakest_answer_snapshot"] == "顧客課題に近い立場で改善したいです。"
