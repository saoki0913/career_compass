import pytest

from app.services.es_review.models import ReviewRequest, TemplateRequest
import app.services.es_review.orchestrator as orchestrator_module
from app.services.es_review.orchestrator import (
    prepare_review_context,
    review_section_with_template,
)


class FakeTextResult:
    def __init__(self, text: str = "添削結果。", *, success: bool = True):
        self.success = success
        self.data = {"text": text} if success else None
        self.error = None
        self.usage = None


@pytest.mark.asyncio
async def test_prepare_review_context_direct_call_uses_injected_text_caller() -> None:
    async def fake_text_caller(*args, **kwargs):
        return FakeTextResult()

    request = ReviewRequest(
        content="研究で仮説検証を重ねた経験を生かしたい。",
        section_title="自己PRを教えてください。",
        template_request=TemplateRequest(
            template_type="self_pr",
            question="自己PRを教えてください。",
            answer="研究で仮説検証を重ねた経験を生かしたい。",
            char_min=20,
            char_max=80,
        ),
    )

    ctx = await prepare_review_context(
        request=request,
        rag_sources=[],
        company_rag_available=False,
        text_caller=fake_text_caller,
    )

    assert ctx.template_type == "self_pr"
    assert ctx.json_caller is not None
    assert ctx.text_caller is fake_text_caller
    assert ctx.effective_company_rag_available is False
    assert ctx.evidence_coverage_level == "none"


@pytest.mark.asyncio
async def test_review_section_with_template_runs_service_stages_in_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    fake_context = object()
    fake_loop_result = object()
    fake_recovery = object()
    fake_response = object()

    async def fake_prepare_review_context(**kwargs):
        calls.append("prepare")
        assert kwargs["json_caller"] is fake_json_caller
        assert kwargs["text_caller"] is fake_text_caller
        return fake_context

    async def fake_execute_rewrite_loop(ctx):
        calls.append("rewrite")
        assert ctx is fake_context
        return fake_loop_result

    async def fake_execute_recovery_pipeline(ctx, loop_result):
        calls.append("recovery")
        assert ctx is fake_context
        assert loop_result is fake_loop_result
        return fake_recovery

    async def fake_assemble_review_response(ctx, loop_result, recovery):
        calls.append("assemble")
        assert ctx is fake_context
        assert loop_result is fake_loop_result
        assert recovery is fake_recovery
        return fake_response

    async def fake_json_caller(*args, **kwargs):
        raise AssertionError("stage fakes should not call json caller")

    async def fake_text_caller(*args, **kwargs):
        raise AssertionError("stage fakes should not call text caller")

    monkeypatch.setattr(
        orchestrator_module,
        "prepare_review_context",
        fake_prepare_review_context,
    )
    monkeypatch.setattr(
        orchestrator_module,
        "execute_rewrite_loop",
        fake_execute_rewrite_loop,
    )
    monkeypatch.setattr(
        orchestrator_module,
        "execute_recovery_pipeline",
        fake_execute_recovery_pipeline,
    )
    monkeypatch.setattr(
        orchestrator_module,
        "assemble_review_response",
        fake_assemble_review_response,
    )

    request = ReviewRequest(
        content="研究で仮説検証を重ねた経験を生かしたい。",
        section_title="自己PRを教えてください。",
        template_request=TemplateRequest(
            template_type="self_pr",
            question="自己PRを教えてください。",
            answer="研究で仮説検証を重ねた経験を生かしたい。",
            char_min=20,
            char_max=80,
        ),
    )

    result = await review_section_with_template(
        request,
        rag_sources=[],
        company_rag_available=False,
        json_caller=fake_json_caller,
        text_caller=fake_text_caller,
    )

    assert result is fake_response
    assert calls == ["prepare", "rewrite", "recovery", "assemble"]
