import json
from types import SimpleNamespace

import pytest

from app.routers.motivation import NextQuestionRequest, _generate_next_question_progress


@pytest.mark.asyncio
async def test_streaming_emits_only_final_canonical_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_company_context(*args, **kwargs):
        return (
            "顧客課題に向き合うDX支援と業務改革を進める。",
            [{"source_id": "S1", "source_url": "https://example.com/recruit"}],
        )

    async def fake_evaluate(*args, **kwargs):
        return {
            "scores": {
                "company_understanding": 32,
                "self_analysis": 28,
                "career_vision": 24,
                "differentiation": 20,
            },
            "weakest_element": "company_understanding",
            "is_complete": False,
            "missing_aspects": {},
            "risk_flags": [],
        }

    async def fake_stream(*args, **kwargs):
        yield SimpleNamespace(type="string_chunk", path="question", text="入社後に")
        yield SimpleNamespace(type="string_chunk", path="question", text="何をしたいですか？")
        yield SimpleNamespace(
            type="complete",
            result=SimpleNamespace(
                success=True,
                data={
                    "question": "入社後に何をしたいですか？",
                    "question_focus": "work_image",
                    "coaching_focus": "やりたい仕事",
                },
                error=None,
            ),
        )

    monkeypatch.setattr("app.routers.motivation._get_company_context", fake_company_context)
    monkeypatch.setattr("app.routers.motivation._evaluate_motivation_internal", fake_evaluate)
    monkeypatch.setattr("app.routers.motivation.call_llm_streaming_fields", fake_stream)

    request = NextQuestionRequest(
        company_id="company_test",
        company_name="株式会社テスト",
        industry="IT・通信",
        conversation_history=[
            {"role": "assistant", "content": "IT・通信業界を志望する理由を1つ教えてください。"},
            {"role": "user", "content": "複数の業界課題に関われるからです。"},
        ],
        question_count=1,
        scores=None,
        gakuchika_context=[{"title": "学生団体の運営", "strengths": ["巻き込み力"]}],
        conversation_context={
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "industryReason": "複数の業界課題に関われるから",
            "questionStage": "company_reason",
        },
        profile_context={"target_job_types": ["企画職"], "target_industries": ["IT・通信"]},
        application_job_candidates=["企画職"],
        company_role_candidates=["企画職"],
        company_work_candidates=["DX支援"],
    )

    events: list[dict] = []
    async for payload in _generate_next_question_progress(request):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    question_chunks = [event for event in events if event["type"] == "string_chunk" and event["path"] == "question"]
    complete_events = [event for event in events if event["type"] == "complete"]

    assert complete_events
    canonical_question = complete_events[0]["data"]["question"]
    assert canonical_question == "株式会社テストを志望先として考えるとき、どんな点に魅力を感じますか？"
    assert question_chunks == []
