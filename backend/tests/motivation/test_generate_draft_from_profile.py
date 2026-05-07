from types import SimpleNamespace

import pytest

from app.routers import motivation
from app.routers.motivation_models import GenerateDraftFromProfileRequest
from app.security.career_principal import CareerPrincipal


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


def _request(gakuchika_context: list[dict] | None) -> GenerateDraftFromProfileRequest:
    return GenerateDraftFromProfileRequest(
        company_id="company_test",
        company_name="株式会社テスト",
        industry="IT・通信",
        selected_role="企画職",
        char_limit=400,
        gakuchika_context=gakuchika_context,
        profile_context={
            "target_job_types": ["企画職"],
            "target_industries": ["IT・通信"],
        },
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("gakuchika_context", "expected_self_connection"),
    [
        ([{"title": "学生団体の運営", "strengths": ["巻き込み力"]}], True),
        (None, False),
    ],
)
async def test_generate_draft_from_profile_resolves_experience_anchor_from_request(
    monkeypatch: pytest.MonkeyPatch,
    gakuchika_context: list[dict] | None,
    expected_self_connection: bool,
) -> None:
    async def fake_company_context(*args, **kwargs):
        return (
            "DX支援を通じて顧客課題を解決する。業務改革の知見がある。",
            [{"title": "DX支援", "excerpt": "DX支援の実績"}],
        )

    async def fake_call_llm_with_error(*args, **kwargs):
        return SimpleNamespace(
            success=True,
            data={
                "draft": "私はDX支援を通じて顧客課題の整理と解決に携わりたいと考え、貴社を志望します。",
                "key_points": [],
                "company_keywords": [],
            },
            error=None,
        )

    async def fake_quality_retry(**kwargs):
        return (
            kwargs["initial_draft"],
            {"score": 0.0, "tier": 0},
            [],
            {"quality_retry_attempted": False},
        )

    async def fake_refinement(**kwargs):
        return kwargs["initial_draft"], {"refinement_attempted": False}

    monkeypatch.setattr(motivation, "_get_company_context", fake_company_context)
    monkeypatch.setattr(motivation, "call_llm_with_error", fake_call_llm_with_error)
    monkeypatch.setattr(motivation, "_maybe_retry_for_draft_quality", fake_quality_retry)
    monkeypatch.setattr(motivation, "_apply_multipass_refinement", fake_refinement)
    monkeypatch.setattr(
        motivation,
        "_retry_collect_draft_quality_failure_codes",
        lambda **kwargs: ([], {"score": 0.0, "tier": 0}, True),
    )
    monkeypatch.setattr(
        motivation,
        "consume_request_llm_cost_summary",
        lambda feature: {"total_tokens": 123},
    )

    response = await motivation.generate_draft_from_profile.__wrapped__(
        _request(gakuchika_context),
        request=SimpleNamespace(),
        principal=_principal(),
    )

    assert response.draft
    assert response.internal_telemetry["total_tokens"] == 123
    assert ("自己接続" in response.key_points) is expected_self_connection
    assert "やりたい仕事" in response.key_points
