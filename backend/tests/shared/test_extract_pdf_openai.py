import pytest
from types import SimpleNamespace

from app.utils.llm_responses import extract_text_from_pdf_with_openai


@pytest.mark.asyncio
async def test_empty_pdf_bytes_returns_empty_immediately() -> None:
    """pdf_bytes=b'' のとき API を呼ばずに空結果を返す。"""
    text, usage, model_id = await extract_text_from_pdf_with_openai(
        b"", "empty.pdf"
    )

    assert text == ""
    assert usage == {
        "input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "cached_input_tokens": 0,
    }
    assert model_id == ""


@pytest.mark.asyncio
async def test_explicit_model_skips_resolve(monkeypatch: pytest.MonkeyPatch) -> None:
    """model 引数を明示したとき _resolve_openai_model が呼ばれないこと。"""
    resolve_called = False

    def spy_resolve(feature: str) -> str:
        nonlocal resolve_called
        resolve_called = True
        return "gpt-4o-mini"

    monkeypatch.setattr(
        "app.utils.llm_responses._resolve_openai_model", spy_resolve
    )

    fake_response = SimpleNamespace(
        output_text="抽出されたテキスト",
        usage=SimpleNamespace(
            input_tokens=100,
            output_tokens=50,
            output_tokens_details=SimpleNamespace(reasoning_tokens=0),
            input_tokens_details=SimpleNamespace(cached_tokens=0),
        ),
    )

    class FakeResponses:
        async def create(self, **kwargs):
            return fake_response

    class FakeClient:
        responses = FakeResponses()

    async def fake_get_openai_client(for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(
        "app.utils.llm_providers.get_openai_client", fake_get_openai_client
    )
    monkeypatch.setattr(
        "app.utils.llm_responses._log", lambda *a, **kw: None
    )

    def noop_log_cost(**kwargs):
        pass

    monkeypatch.setattr("app.utils.llm.log_llm_cost_event", noop_log_cost)

    text, usage, model_id = await extract_text_from_pdf_with_openai(
        b"%PDF-fake", "test.pdf", model="gpt-4o-mini"
    )

    assert resolve_called is False
    assert text == "抽出されたテキスト"
    assert model_id == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_model_none_calls_resolve(monkeypatch: pytest.MonkeyPatch) -> None:
    """model=None のとき _resolve_openai_model が呼ばれること。"""
    resolve_called_with: list[str] = []

    def spy_resolve(feature: str) -> str:
        resolve_called_with.append(feature)
        return "gpt-4o"

    monkeypatch.setattr(
        "app.utils.llm_responses._resolve_openai_model", spy_resolve
    )

    fake_response = SimpleNamespace(
        output_text="PDF内容",
        usage=SimpleNamespace(
            input_tokens=200,
            output_tokens=80,
            output_tokens_details=SimpleNamespace(reasoning_tokens=0),
            input_tokens_details=SimpleNamespace(cached_tokens=0),
        ),
    )

    class FakeResponses:
        async def create(self, **kwargs):
            assert kwargs["model"] == "gpt-4o"
            return fake_response

    class FakeClient:
        responses = FakeResponses()

    async def fake_get_openai_client(for_rag: bool = False):
        return FakeClient()

    monkeypatch.setattr(
        "app.utils.llm_providers.get_openai_client", fake_get_openai_client
    )
    monkeypatch.setattr(
        "app.utils.llm_responses._log", lambda *a, **kw: None
    )

    def noop_log_cost(**kwargs):
        pass

    monkeypatch.setattr("app.utils.llm.log_llm_cost_event", noop_log_cost)

    text, usage, model_id = await extract_text_from_pdf_with_openai(
        b"%PDF-fake", "test.pdf", model=None, feature="company_info"
    )

    assert resolve_called_with == ["company_info"]
    assert text == "PDF内容"
    assert model_id == "gpt-4o"
    assert usage["input_tokens"] == 200
    assert usage["output_tokens"] == 80
