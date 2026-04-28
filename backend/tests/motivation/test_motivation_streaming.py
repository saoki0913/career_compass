import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers.motivation import NextQuestionRequest
from app.routers.motivation_streaming import _generate_next_question_progress


@pytest.mark.asyncio
async def test_streaming_emits_only_final_canonical_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_system_prompt: dict[str, str] = {}

    async def fake_company_context(*args, **kwargs):
        return (
            "顧客課題に向き合うDX支援と業務改革を進める。",
            [{"source_id": "S1", "source_url": "https://example.com/recruit"}],
        )

    async def fake_evaluate(*args, **kwargs):
        return {
            "evaluation_status": "ok",
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
        captured_system_prompt["value"] = args[0] if args else kwargs.get("system_prompt", "")
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

    async def fake_retry_llm(**kwargs):
        return SimpleNamespace(success=False, data=None, raw_text=None, error=None)

    monkeypatch.setattr("app.routers.motivation._get_company_context", fake_company_context)
    monkeypatch.setattr("app.routers.motivation._evaluate_motivation_internal", fake_evaluate)
    monkeypatch.setattr("app.routers.motivation.call_llm_with_error", fake_retry_llm)
    monkeypatch.setattr("app.routers.motivation_streaming.call_llm_streaming_fields", fake_stream)

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
            "questionStage": "industry_reason",
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
    # D-1 (P2-8): 選択型/機械的ペアリングを撤廃したフォールバック候補の 1 つ目
    assert canonical_question == "株式会社テストの事業や取り組みで、気になっている点はありますか？"
    assert canonical_question


@pytest.mark.asyncio
async def test_streaming_http_exception_error_event_includes_error_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_prepare(*args, **kwargs):
        raise HTTPException(
            status_code=503,
            detail={
                "error": "tenant key is not configured",
                "error_type": "tenant_key_not_configured",
            },
        )

    monkeypatch.setattr("app.routers.motivation_pipeline._prepare_motivation_next_question", fake_prepare)

    request = NextQuestionRequest(
        company_id="company_test",
        company_name="株式会社テスト",
        industry="IT・通信",
        conversation_history=[],
        question_count=0,
        conversation_context={},
    )

    events: list[dict] = []
    async for payload in _generate_next_question_progress(request, tenant_key=None):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    error_events = [event for event in events if event["type"] == "error"]
    assert error_events
    assert error_events[0]["message"] == "tenant key is not configured"
    assert error_events[0]["error_type"] == "tenant_key_not_configured"
    assert error_events[0]["status_code"] == 503


@pytest.mark.asyncio
async def test_streaming_llm_error_event_uses_stable_question_error_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_company_context(*args, **kwargs):
        return "", []

    async def fake_evaluate(*args, **kwargs):
        return {
            "evaluation_status": "ok",
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
        yield SimpleNamespace(
            type="error",
            result=SimpleNamespace(
                error=SimpleNamespace(
                    message="AIサービスに接続できませんでした。",
                    error_type="network",
                ),
            ),
        )

    monkeypatch.setattr("app.routers.motivation._get_company_context", fake_company_context)
    monkeypatch.setattr("app.routers.motivation._evaluate_motivation_internal", fake_evaluate)
    monkeypatch.setattr("app.routers.motivation_streaming.call_llm_streaming_fields", fake_stream)

    request = NextQuestionRequest(
        company_id="company_test",
        company_name="株式会社テスト",
        industry="IT・通信",
        conversation_history=[
            {"role": "assistant", "content": "志望理由を教えてください。"},
            {"role": "user", "content": "事業に興味があります。"},
        ],
        question_count=1,
        conversation_context={
            "selectedIndustry": "IT・通信",
            "selectedRole": "企画職",
            "industryReason": "事業に興味があるから",
            "questionStage": "industry_reason",
        },
    )

    events: list[dict] = []
    async for payload in _generate_next_question_progress(request, tenant_key="tenant-test"):
        events.append(json.loads(payload.removeprefix("data: ").strip()))

    error_events = [event for event in events if event["type"] == "error"]
    assert error_events
    assert error_events[0]["error_type"] == "question_provider_failure"
    assert error_events[0]["upstream_error_type"] == "network"
