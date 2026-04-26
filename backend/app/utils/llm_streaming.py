"""
LLMストリーミングモジュール

Anthropic Claude のトークンレベルストリーミングを提供:
- call_llm_streaming(): 基本ストリーミング + JSON 解析
- call_llm_streaming_fields(): フィールド単位の進捗付きストリーミング

基盤ヘルパー（ロガー、CircuitBreaker、プロバイダー呼び出し）は
llm_providers / llm_client_registry から直接 import する。
llm.py のオーケストレーション関数（call_llm_with_error, log_llm_cost_event,
_call_claude, _json_repair_*）だけは循環インポートを避けるために関数内で
遅延 import している。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncGenerator, Callable, Optional

from anthropic import APIError as AnthropicAPIError

from app.config import settings
from app.utils.llm_client_registry import get_circuit_breaker
from app.utils.llm_model_routing import (
    LLMModel,
    ResponseFormat,
    get_model_config,
    get_model_display_name,
    _resolve_model_target,
)
from app.utils.llm_providers import (
    ERROR,
    SUCCESS,
    WARNING,
    LLMResult,
    _call_claude_raw_stream,
    _classify_anthropic_error,
    _create_error,
    _log,
    _log_debug,
    _parse_json_response,
)
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


@dataclass
class StreamFieldEvent:
    """Event emitted during token-level streaming."""

    type: str  # "chunk", "string_chunk", "field_complete", "array_item_complete", "complete", "error"
    path: str = ""  # e.g., "scores", "top3.0", "rewrites.1"
    text: str = ""  # For chunk/string_chunk events
    value: object = None  # For field_complete/array_item_complete events
    result: Optional[Any] = None  # LLMResult — Optional[Any] to avoid circular import


async def call_llm_streaming(
    system_prompt: str,
    user_message: str,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: LLMModel | None = None,
    feature: str | None = None,
    on_chunk: Optional[Callable[[str, int], None]] = None,
) -> Any:  # returns LLMResult
    """
    ストリーミングでLLMを呼び出し、チャンクごとにon_chunkコールバックを実行。
    最終的にJSON解析して結果を返す。

    Args:
        on_chunk: コールバック(chunk_text, accumulated_length)
    """
    from app.utils.llm import (  # local import to break cycle with llm.py
        _call_claude,
        _call_claude_raw_stream,
        _emit_output_leakage_event,
        _json_repair_system_prompt,
        _json_repair_user_prompt,
        call_llm_with_error,
        log_llm_cost_event,
    )

    feature = feature or "unknown"

    if model is None:
        model = get_model_config().get(feature, "claude-sonnet")

    target = _resolve_model_target(feature, model)

    # Only Anthropic models support token streaming in this implementation
    if target.provider != "anthropic":
        # Fall back to non-streaming for non-Claude models
        return await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
            model=model,
            feature=feature,
        )

    actual_model = target.actual_model

    model_display = get_model_display_name(actual_model)
    _log(feature, f"{model_display} をストリーミング呼び出し中...")

    try:
        accumulated = ""
        usage_summary: dict[str, int] | None = None

        def _capture_usage(usage: dict[str, int] | None) -> None:
            nonlocal usage_summary
            usage_summary = usage

        async for chunk in _call_claude_raw_stream(
            system_prompt=system_prompt,
            user_message=user_message,
            messages=None,
            max_tokens=max_tokens,
            temperature=temperature,
            model=actual_model,
            feature=feature,
            on_complete=_capture_usage,
        ):
            accumulated += chunk
            if on_chunk:
                on_chunk(chunk, len(accumulated))

        if not accumulated:
            error = _create_error("parse", "anthropic", feature, "空のストリーミングレスポンス")
            return LLMResult(success=False, error=error)

        if settings.debug:
            _log_debug(
                feature,
                f"Streaming response complete: chars={len(accumulated)}",
            )

        log_llm_cost_event(
            feature=feature,
            provider=target.provider,
            resolved_model=actual_model,
            call_kind="stream",
            usage=usage_summary,
        )
        _emit_output_leakage_event(
            feature=feature,
            model=actual_model or "",
            provider="anthropic",
            raw_text=accumulated,
        )

        result = _parse_json_response(accumulated)
        if result is not None:
            _log(feature, f"{model_display} ストリーミング成功", SUCCESS)
            return LLMResult(
                success=True,
                data=result,
                usage=usage_summary,
                resolved_model=actual_model,
            )

        # JSON parse failed - try repair via non-streaming call
        _log(feature, "ストリーミング応答のJSON解析失敗、修復を試行", WARNING)
        repair_prompt = _json_repair_user_prompt(accumulated[:3000])
        repair_result = await _call_claude(
            system_prompt=_json_repair_system_prompt(),
            user_message=repair_prompt,
            messages=None,
            max_tokens=max_tokens,
            temperature=0.1,
            feature=feature,
        )
        if repair_result is not None:
            _log(feature, f"{model_display} JSON修復成功", SUCCESS)
            return LLMResult(success=True, data=repair_result)

        error = _create_error("parse", "anthropic", feature, "ストリーミング応答の解析に失敗")
        return LLMResult(success=False, error=error)

    except AnthropicAPIError as e:
        error_type, detail = _classify_anthropic_error(e)
        error = _create_error(error_type, "anthropic", feature, detail)
        _log(feature, f"Anthropic ストリーミングエラー: {detail}", ERROR)
        return LLMResult(success=False, error=error)

    except Exception as e:
        error = _create_error("unknown", "anthropic", feature, str(e))
        _log(feature, f"ストリーミング予期しないエラー: {e}", ERROR)
        return LLMResult(success=False, error=error)


# ── Token-level streaming with field extraction ──────────────────────────


async def call_llm_streaming_fields(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: LLMModel | None = None,
    feature: str | None = None,
    schema_hints: dict[str, str] | None = None,
    stream_string_fields: list[str] | None = None,
    response_format: ResponseFormat = "json_object",
    json_schema: dict | None = None,
    use_responses_api: bool = False,
    attempt_repair_on_parse_failure: bool = True,
    partial_required_fields: tuple[str, ...] | None = None,
) -> AsyncGenerator[StreamFieldEvent, None]:
    """Stream LLM response with incremental JSON field extraction.

    Yields StreamFieldEvent instances:
    - "chunk": Raw text fragment from LLM
    - "string_chunk": Partial content of a streamed string field (e.g., question text)
    - "field_complete": A top-level JSON field finished parsing
    - "array_item_complete": An array element finished parsing
    - "complete": Final validated LLMResult (always the last event on success)
    - "error": An error occurred

    The "complete" event carries the authoritative final result parsed via
    the full 6-layer JSON recovery chain. Frontend should treat field_complete
    events as progressive previews and overwrite with complete's result.
    """
    from app.utils.llm import (  # local import to break cycle with llm.py
        _call_claude,
        _call_claude_raw_stream,
        _emit_output_leakage_event,
        _json_repair_system_prompt,
        _json_repair_user_prompt,
        call_llm_with_error,
        log_llm_cost_event,
    )
    from app.utils.streaming_json import StreamingJSONExtractor, StreamEventType

    feature = feature or "unknown"

    if model is None:
        model = get_model_config().get(feature, "claude-sonnet")

    target = _resolve_model_target(feature, model)

    # Non-Anthropic models: fall back to non-streaming
    if target.provider != "anthropic":
        result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
            model=model,
            feature=feature,
            response_format=response_format,
            json_schema=json_schema,
            use_responses_api=use_responses_api,
        )
        yield StreamFieldEvent(type="complete", result=result)
        return

    actual_model = target.actual_model

    model_display = get_model_display_name(actual_model)
    _log(feature, f"{model_display} をフィールドストリーミング呼び出し中...")

    extractor = StreamingJSONExtractor(
        schema_hints=schema_hints,
        stream_string_fields=stream_string_fields,
    )
    partial_required_fields = partial_required_fields or ()
    anthropic_circuit = get_circuit_breaker("anthropic")

    try:
        usage_summary: dict[str, int] | None = None

        def _capture_usage(usage: dict[str, int] | None) -> None:
            nonlocal usage_summary
            usage_summary = usage

        async for chunk in _call_claude_raw_stream(
            system_prompt=system_prompt,
            user_message=user_message,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            model=actual_model,
            feature=feature,
            on_complete=_capture_usage,
        ):
            # Emit raw chunk event
            yield StreamFieldEvent(type="chunk", text=chunk)

            # Feed to JSON extractor
            field_events = extractor.feed(chunk)
            for fe in field_events:
                if fe.type == StreamEventType.STRING_CHUNK:
                    yield StreamFieldEvent(
                        type="string_chunk", path=fe.path, text=fe.text
                    )
                elif fe.type == StreamEventType.FIELD_COMPLETE:
                    yield StreamFieldEvent(
                        type="field_complete", path=fe.path, value=fe.value
                    )
                elif fe.type == StreamEventType.ARRAY_ITEM_COMPLETE:
                    yield StreamFieldEvent(
                        type="array_item_complete", path=fe.path, value=fe.value
                    )

        # Stream finished — parse the full accumulated text
        accumulated = extractor.get_accumulated()

        if not accumulated:
            error = _create_error("parse", "anthropic", feature, "空のストリーミングレスポンス")
            yield StreamFieldEvent(
                type="error",
                result=LLMResult(success=False, error=error),
            )
            return

        if settings.debug:
            _log_debug(feature, f"Field streaming complete: chars={len(accumulated)}")

        log_llm_cost_event(
            feature=feature,
            provider=target.provider,
            resolved_model=actual_model,
            call_kind="stream_fields",
            usage=usage_summary,
        )
        _emit_output_leakage_event(
            feature=feature,
            model=actual_model or "",
            provider="anthropic",
            raw_text=accumulated,
        )

        result = _parse_json_response(accumulated)
        if result is not None:
            _log(feature, f"{model_display} フィールドストリーミング成功", SUCCESS)
            anthropic_circuit.record_success()
            yield StreamFieldEvent(
                type="complete",
                result=LLMResult(
                    success=True,
                    data=result,
                    raw_text=accumulated,
                    usage=usage_summary,
                    resolved_model=actual_model,
                ),
            )
            return

        partial = extractor.get_completed_fields()
        if partial and partial_required_fields and all(
            field in partial for field in partial_required_fields
        ):
            _log(
                feature,
                f"部分フィールドをフォールバックとして使用 (fields={list(partial.keys())})",
                WARNING,
            )
            yield StreamFieldEvent(
                type="complete",
                result=LLMResult(
                    success=True,
                    data=partial,
                    raw_text=accumulated,
                    usage=usage_summary,
                    resolved_model=actual_model,
                ),
            )
            return

        if not attempt_repair_on_parse_failure:
            if partial and partial_required_fields:
                missing_required = [
                    field for field in partial_required_fields if field not in partial
                ]
                if missing_required:
                    _log(
                        feature,
                        f"フォールバック時に必須フィールド欠落: {missing_required}",
                        WARNING,
                    )
            error = _create_error(
                "parse",
                "anthropic",
                feature,
                "フィールドストリーミング応答の解析に失敗",
            )
            yield StreamFieldEvent(
                type="error",
                result=LLMResult(success=False, error=error, raw_text=accumulated),
            )
            return

        # JSON parse failed — try repair
        _log(feature, "フィールドストリーミング応答のJSON解析失敗、修復を試行", WARNING)
        repair_prompt = _json_repair_user_prompt(accumulated[:3000])
        repair_result = await _call_claude(
            system_prompt=_json_repair_system_prompt(),
            user_message=repair_prompt,
            messages=None,
            max_tokens=max_tokens,
            temperature=0.1,
            feature=feature,
        )
        if repair_result is not None:
            _log(feature, f"{model_display} JSON修復成功", SUCCESS)
            yield StreamFieldEvent(
                type="complete",
                result=LLMResult(
                    success=True,
                    data=repair_result,
                    raw_text=accumulated,
                    usage=usage_summary,
                    resolved_model=actual_model,
                ),
            )
            return

        # Use partial fields as best-effort fallback
        if partial:
            _log(
                feature,
                f"部分フィールドをフォールバックとして使用 (fields={list(partial.keys())})",
                WARNING,
            )
            yield StreamFieldEvent(
                type="complete",
                result=LLMResult(
                    success=True,
                    data=partial,
                    raw_text=accumulated,
                    usage=usage_summary,
                    resolved_model=actual_model,
                ),
            )
            return

        error = _create_error("parse", "anthropic", feature, "フィールドストリーミング応答の解析に失敗")
        yield StreamFieldEvent(
            type="error",
            result=LLMResult(success=False, error=error, raw_text=accumulated),
        )

    except AnthropicAPIError as e:
        error_type, detail = _classify_anthropic_error(e)
        error = _create_error(error_type, "anthropic", feature, detail)
        _log(feature, f"Anthropic フィールドストリーミングエラー: {detail}", ERROR)
        anthropic_circuit.record_failure()
        yield StreamFieldEvent(
            type="error",
            result=LLMResult(success=False, error=error),
        )

    except Exception as e:
        error = _create_error("unknown", "anthropic", feature, str(e))
        _log(feature, f"フィールドストリーミング予期しないエラー: {e}", ERROR)
        yield StreamFieldEvent(
            type="error",
            result=LLMResult(success=False, error=error),
        )
