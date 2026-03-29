import json
from types import SimpleNamespace

import pytest

from app.routers.interview import (
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
    _generate_feedback_progress,
    _generate_question_progress,
)


@pytest.mark.asyncio
async def test_question_stream_emits_stage_aware_chunks_and_complete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_stream(*args, **kwargs):
        yield SimpleNamespace(type="string_chunk", path="question", text="UI Review")
        yield SimpleNamespace(type="string_chunk", path="question", text="株式会社を志望する理由を教えてください。")
        yield SimpleNamespace(
            type="complete",
            result=SimpleNamespace(
                success=True,
                data={
                    "question": "UI Review株式会社を志望する理由を教えてください。",
                    "focus": "企業理解の起点",
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
    )

    events = []
    async for payload in _generate_question_progress(request, question_index=1):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    question_chunks = [e for e in events if e["type"] == "string_chunk" and e["path"] == "question"]
    complete_event = next(e for e in events if e["type"] == "complete")

    assert "".join(chunk["text"] for chunk in question_chunks) == "UI Review株式会社を志望する理由を教えてください。"
    assert complete_event["data"]["question"] == "UI Review株式会社を志望する理由を教えてください。"
    assert complete_event["data"]["question_stage"] == "opening"
    assert complete_event["data"]["stage_status"] == {
        "current": "opening",
        "completed": [],
        "pending": ["company_understanding", "experience", "motivation_fit", "feedback"],
    }


@pytest.mark.asyncio
async def test_feedback_stream_emits_overall_comment_then_complete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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
                },
                error=None,
            ),
        )

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewFeedbackRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "顧客課題に近い立場で改善したいです。"},
        ],
    )

    events = []
    async for payload in _generate_feedback_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    feedback_chunks = [
        e for e in events if e["type"] == "string_chunk" and e["path"] == "overall_comment"
    ]
    complete_event = next(e for e in events if e["type"] == "complete")

    assert "".join(chunk["text"] for chunk in feedback_chunks) == "企業理解と経験接続は明確でした。"
    assert complete_event["data"]["overall_comment"] == "企業理解と経験接続は明確でした。"
    assert complete_event["data"]["scores"]["company_fit"] == 4
    assert complete_event["data"]["stage_status"] == {
        "current": "feedback",
        "completed": ["opening", "company_understanding", "experience", "motivation_fit"],
        "pending": [],
    }


@pytest.mark.asyncio
async def test_follow_up_question_index_maps_to_motivation_fit_stage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_stream(*args, **kwargs):
        yield SimpleNamespace(
            type="complete",
            result=SimpleNamespace(
                success=True,
                data={"question": "この企業で実現したい役割をもう少し具体化してください。"},
                error=None,
            ),
        )

    monkeypatch.setattr("app.routers.interview.call_llm_streaming_fields", fake_stream)

    request = InterviewTurnRequest(
        company_name="UI Review株式会社",
        company_summary="DX 支援を行う。",
        motivation_summary="顧客課題の解像度を上げたい。",
        gakuchika_summary="学園祭運営で進行管理を担当。",
        es_summary="ES で課題整理力を訴求。",
        conversation_history=[
            {"role": "assistant", "content": "導入質問"},
            {"role": "user", "content": "回答1"},
            {"role": "assistant", "content": "企業理解質問"},
            {"role": "user", "content": "回答2"},
            {"role": "assistant", "content": "経験質問"},
            {"role": "user", "content": "回答3"},
            {"role": "assistant", "content": "適合質問"},
            {"role": "user", "content": "回答4"},
        ],
    )

    events = []
    async for payload in _generate_question_progress(request, question_index=5):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    complete_event = next(e for e in events if e["type"] == "complete")
    assert complete_event["data"]["question_stage"] == "motivation_fit"
    assert complete_event["data"]["stage_status"]["current"] == "motivation_fit"
