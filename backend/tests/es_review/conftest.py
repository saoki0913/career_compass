"""Shared test fixtures for es_review test suite."""

from __future__ import annotations

from app.utils.llm_providers import LLMError, LLMResultLike


class FakeLLMResult:
    """Test double for LLMResult. Matches the real dataclass field set."""

    def __init__(
        self,
        data: dict | None = None,
        *,
        success: bool = True,
        error: LLMError | None = None,
        usage: dict | None = None,
        raw_text: str | None = None,
        resolved_model: str | None = None,
    ):
        self.success = success
        self.data = data
        self.error = error
        self.usage = usage
        self.raw_text = raw_text
        self.resolved_model = resolved_model

    @classmethod
    def text_ok(cls, text: str, *, usage: dict | None = None) -> FakeLLMResult:
        return cls(data={"text": text}, usage=usage)

    @classmethod
    def text_fail(cls, *, error: LLMError | None = None) -> FakeLLMResult:
        return cls(success=False, error=error)

    @classmethod
    def json_ok(cls, data: dict, *, usage: dict | None = None) -> FakeLLMResult:
        return cls(data=data, usage=usage)

    @classmethod
    def json_fail(cls, *, error: LLMError | None = None) -> FakeLLMResult:
        return cls(success=False, error=error)

    @classmethod
    def rate_limit_error(cls, provider: str = "anthropic") -> FakeLLMResult:
        return cls(
            success=False,
            error=LLMError(
                error_type="rate_limit",
                message="レート制限に達しました。",
                detail="429 Too Many Requests",
                provider=provider,
                feature="es_review",
            ),
        )


class FakeJsonResult(FakeLLMResult):
    """JSON caller 用テストダブル（後方互換エイリアス）。

    既存テストの ``FakeJsonResult(data)`` / ``FakeJsonResult(success=False)``
    呼び出しパターンをそのまま維持する。
    """

    def __init__(
        self,
        data: dict | None = None,
        *,
        success: bool = True,
        error: LLMError | None = None,
        usage: dict | None = None,
    ):
        super().__init__(data=data, success=success, error=error, usage=usage)


class FakeTextResult(FakeLLMResult):
    """Text caller 用テストダブル（後方互換エイリアス）。

    既存テストの ``FakeTextResult("text")`` / ``FakeTextResult()`` (デフォルト付き)
    呼び出しパターンをそのまま維持する。
    """

    def __init__(
        self,
        text: str = "添削結果。",
        *,
        success: bool = True,
        error: LLMError | None = None,
        usage: dict | None = None,
    ):
        super().__init__(
            data={"text": text} if success else None,
            success=success,
            error=error,
            usage=usage,
        )


assert isinstance(FakeLLMResult.text_ok("x"), LLMResultLike)
