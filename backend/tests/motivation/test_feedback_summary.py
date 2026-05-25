from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import motivation
from app.routers.motivation_models import FeedbackSummaryRequest
from app.security.career_principal import CareerPrincipal
from app.services.motivation import feedback_summary


def _principal(company_id: str = "company_test") -> CareerPrincipal:
    return CareerPrincipal(
        scope="company",
        actor_kind="user",
        actor_id="user_test",
        plan="free",
        company_id=company_id,
        jti="jti_test",
        tenant_key="tenant_test",
    )


def _request(company_id: str = "company_test") -> FeedbackSummaryRequest:
    return FeedbackSummaryRequest(
        company_id=company_id,
        company_name="株式会社テスト",
        industry="IT・通信",
        selected_role="企画職",
        conversation_history=[{"role": "user", "content": "DX支援に関心があります"}],
        slot_summaries={"company_reason": "DX支援への共感"},
        slot_evidence_sentences={"company_reason": ["DX支援に関心があります"]},
        draft_text="私はDX支援を通じて顧客課題の解決に携わりたく貴社を志望します。",
    )


@pytest.mark.asyncio
async def test_feedback_summary_rejects_company_id_mismatch() -> None:
    # principal.company_id とリクエストの company_id が不一致なら 403
    with pytest.raises(HTTPException) as exc:
        await motivation.generate_feedback_summary.__wrapped__(
            _request(company_id="company_test"),
            request=SimpleNamespace(),
            principal=_principal(company_id="other_company"),
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_feedback_summary_empty_conversation_rejected() -> None:
    req = _request()
    req.conversation_history = []
    with pytest.raises(HTTPException) as exc:
        await motivation.generate_feedback_summary.__wrapped__(
            req,
            request=SimpleNamespace(),
            principal=_principal(),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_feedback_summary_success_shapes_five_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_call_llm(*args, **kwargs):
        return SimpleNamespace(
            success=True,
            data={
                "one_line_core_answer": "DX支援で顧客課題を解く一貫した志望",
                "strengths": [{"title": "DX関心", "description": "実体験に基づく"}],
                # 文字列配列でも {title, description} に正規化されることを検証
                "improvements": ["企業理由が抽象的"],
                "next_preparation": ["具体的な事業名を調べる。"],
                "likely_followup_questions": ["なぜ同業他社ではないのか"],
            },
            error=None,
        )

    monkeypatch.setattr(feedback_summary, "call_llm_with_error", fake_call_llm)
    monkeypatch.setattr(
        feedback_summary,
        "consume_request_llm_cost_summary",
        lambda feature: {"total_tokens": 99, "feature": feature},
    )

    response = await motivation.generate_feedback_summary.__wrapped__(
        _request(),
        request=SimpleNamespace(),
        principal=_principal(),
    )

    assert response.one_line_core_answer == "DX支援で顧客課題を解く一貫した志望"
    assert response.strengths[0].title == "DX関心"
    assert response.strengths[0].description == "実体験に基づく"
    # str -> {title, description: ""} の正規化
    assert response.improvements[0].title == "企業理由が抽象的"
    assert response.improvements[0].description == ""
    assert response.next_preparation == ["具体的な事業名を調べる。"]
    assert response.likely_followup_questions == ["なぜ同業他社ではないのか"]
    assert response.internal_telemetry["total_tokens"] == 99
    # テレメトリは motivation_summary ラベルで集計される
    assert response.internal_telemetry["feature"] == "motivation_summary"


@pytest.mark.asyncio
async def test_feedback_summary_llm_failure_returns_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_call_llm(*args, **kwargs):
        return SimpleNamespace(
            success=False,
            data=None,
            error=SimpleNamespace(
                message="生成に失敗しました",
                error_type="provider_error",
                provider="anthropic",
            ),
        )

    monkeypatch.setattr(feedback_summary, "call_llm_with_error", fake_call_llm)

    with pytest.raises(HTTPException) as exc:
        await motivation.generate_feedback_summary.__wrapped__(
            _request(),
            request=SimpleNamespace(),
            principal=_principal(),
        )
    assert exc.value.status_code == 503


def test_sanitize_feedback_summary_request_cleans_slots() -> None:
    # slot_summaries / slot_evidence_sentences は draft 生成と同じくサニタイズされ、
    # 未処理のままプロンプトへ注入されない（プロンプトインジェクション対策）。
    from app.services.motivation.feedback_summary import _sanitize_feedback_summary_request

    req = _request()
    req.slot_summaries = {"company_reason": "  DX支援  "}
    req.slot_evidence_sentences = {"company_reason": ["  根拠文  "]}
    _sanitize_feedback_summary_request(req)
    assert req.slot_summaries["company_reason"] == "DX支援"
    assert req.slot_evidence_sentences["company_reason"] == ["根拠文"]
