import json
from types import SimpleNamespace

import pytest

from app.routers.interview import (
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
    _generate_feedback_progress,
    _generate_start_progress,
    _generate_turn_progress,
)


@pytest.mark.asyncio
async def test_start_stream_emits_industry_reason_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_stream(*args, **kwargs):
        yield SimpleNamespace(type="string_chunk", path="question", text="その")
        yield SimpleNamespace(type="string_chunk", path="question", text="業界を志望する理由を教えてください。")
        yield SimpleNamespace(
            type="complete",
            result=SimpleNamespace(
                success=True,
                data={
                    "question": "その業界を志望する理由を教えてください。",
                    "focus": "業界志望の核",
                },
                error=None,
            ),
        )

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewStartRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
    )

    events = []
    async for payload in _generate_start_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["question_stage"] == "industry_reason"
    assert complete_event["data"]["stage_status"] == {
        "current": "industry_reason",
        "completed": [],
        "pending": ["role_reason", "opening", "experience", "company_understanding", "motivation_fit", "feedback"],
    }


@pytest.mark.asyncio
async def test_turn_stream_emits_transition_line_when_stage_advances(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_evaluate(*args, **kwargs):
        return {
            "decision": "advance",
            "recommended_focus": "職種志望の根拠",
            "missing_points": [],
            "interviewer_concerns": [],
        }

    async def fake_stream(*args, **kwargs):
        yield SimpleNamespace(
            type="complete",
            result=SimpleNamespace(
                success=True,
                data={
                    "question": "その職種を志望する理由を、強みと合わせて教えてください。",
                    "focus": "職種志望の根拠",
                    "transition_line": "次は職種志望理由について伺います。",
                },
                error=None,
            ),
        )

    monkeypatch.setattr("app.routers.interview._evaluate_turn", fake_evaluate)
    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewTurnRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        es_summary="ES で課題整理力を訴求。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        conversation_history=[
            {"role": "assistant", "content": "その業界を志望する理由を教えてください。"},
            {"role": "user", "content": "課題解決の仕事に関心があるからです。"},
        ],
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
    )

    events = []
    async for payload in _generate_turn_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["question_stage"] == "role_reason"
    assert complete_event["data"]["transition_line"] == "次は職種志望理由について伺います。"


@pytest.mark.asyncio
async def test_feedback_stream_emits_premise_consistency(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_stream(*args, **kwargs):
        yield SimpleNamespace(type="string_chunk", path="overall_comment", text="企業理解と")
        yield SimpleNamespace(type="string_chunk", path="overall_comment", text="経験接続は明確でした。")
        yield SimpleNamespace(
            type="complete",
            result=SimpleNamespace(
                success=True,
                data={
                    "overall_comment": "企業理解と経験接続は明確でした。",
                    "scores": {
                        "company_fit": 4,
                        "specificity": 4,
                        "logic": 3,
                        "persuasiveness": 4,
                    },
                    "strengths": ["企業理解が具体的"],
                    "improvements": ["結論を先に述べる"],
                    "improved_answer": "結論から述べ、企業との接点を先に示します。",
                    "preparation_points": ["志望理由の一言要約"],
                    "premise_consistency": 82,
                },
                error=None,
            ),
        )

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewFeedbackRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        selected_industry="コンサルティング",
        selected_role="コンサルタント",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "顧客課題に近い立場で改善したいです。"},
        ],
    )

    events = []
    async for payload in _generate_feedback_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["premise_consistency"] == 82
    assert complete_event["data"]["question_stage"] == "feedback"
