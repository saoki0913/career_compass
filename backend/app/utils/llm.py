"""
LLM orchestration module.

Provider-specific calls, response parsing, streaming, routing, cost estimation,
and prompt-safety helpers live in the adjacent ``llm_*`` modules. This file owns
the high-level structured/text call flow and the small compatibility surface
still used by FastAPI routes.
"""

from __future__ import annotations

import json
import time
from typing import Any, Optional

import httpx
from anthropic import APIError as AnthropicAPIError
from openai import APIError as OpenAIAPIError

from app.config import settings
from app.utils import (
    llm_client_registry,
    llm_model_routing,
    llm_prompt_safety,
    llm_providers,
    llm_responses,
    llm_streaming,
    llm_usage_cost,
)
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


# Direct imports for symbols used within this module.
from app.utils.llm_model_routing import (
    _feature_cross_fallback_model,
    _resolve_model_target,
)
from app.utils.llm_providers import (
    ERROR,
    SUCCESS,
    WARNING,
    LLMResult,
    _augment_system_prompt_for_provider_json,
    _augment_system_prompt_for_provider_text,
    _classify_error_for_provider,
    _create_error,
    _detect_truncation,
    _extract_gemini_usage_summary,
    _log,
    _log_debug,
    _normalize_chat_messages,
    _parse_json_response,
    _provider_display_name,
    get_anthropic_client,
    get_google_http_client,
    get_openai_client,
)
from app.utils.llm_responses import (
    OpenAIResponsesRefusalError,
    _should_use_openai_responses_api,
)
from app.utils.llm_usage_cost import estimate_llm_usage_cost_usd

REPAIR_JSON_OPENAI_MAX_TOKENS = 1500


def _emit_output_leakage_event(
    *,
    feature: str,
    model: str,
    provider: str,
    raw_text: str,
) -> None:
    result = llm_prompt_safety.detect_output_leakage(raw_text)
    if not result.is_leaked:
        return
    logger.info(
        json.dumps(
            {
                "event": "llm.output.leakage_detected",
                "feature": feature,
                "model": model,
                "provider": provider,
                "patterns": result.matched_patterns,
                "text_length": len(raw_text),
                "tier": "log_only",
            }
        )
    )


def consume_request_llm_cost_summary(feature: str | None = None) -> dict[str, Any] | None:
    summary = llm_usage_cost._request_llm_cost_summary_var.get()
    llm_usage_cost._request_llm_cost_summary_var.set(None)
    if not summary:
        return None
    if feature:
        summary["feature"] = feature
    resolved_feature = summary.get("feature") or feature or "unknown"
    result: dict[str, Any] = {
        "feature": resolved_feature,
        "input_tokens_total": int(summary.get("input_tokens_total") or 0),
        "output_tokens_total": int(summary.get("output_tokens_total") or 0),
        "reasoning_tokens_total": int(summary.get("reasoning_tokens_total") or 0),
        "cached_input_tokens_total": int(summary.get("cached_input_tokens_total") or 0),
        "usage_status": str(summary.get("usage_status") or "ok"),
        "models_used": list(summary.get("models_used") or []),
    }
    est_usd_total = summary.get("est_usd_total")
    if isinstance(est_usd_total, (int, float)) and est_usd_total > 0:
        result["est_usd_total"] = round(float(est_usd_total), 6)
    est_jpy_total = summary.get("est_jpy_total")
    if isinstance(est_jpy_total, (int, float)) and est_jpy_total > 0:
        result["est_jpy_total"] = round(float(est_jpy_total), 2)
    logger.info("[llm_cost_summary] %s", json.dumps(result, ensure_ascii=False))
    if settings.debug:
        return result
    return None


def log_llm_cost_event(
    *,
    feature: str,
    provider: str,
    resolved_model: str | None,
    call_kind: str,
    usage: dict[str, int] | None,
    trace_id: str | None = None,
) -> None:
    normalized_usage = llm_usage_cost._normalize_usage_summary(usage)
    usage_status = "ok"
    est = None
    if normalized_usage is None:
        normalized_usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
        }
        usage_status = "unavailable"
    else:
        est = llm_usage_cost.estimate_llm_usage_cost_usd(resolved_model or "", normalized_usage)
        if est is None:
            usage_status = "unavailable_price"

    if llm_usage_cost._should_log_llm_cost():
        llm_usage_cost._record_request_llm_cost_summary(
            feature=feature,
            resolved_model=resolved_model or "unknown",
            normalized_usage=normalized_usage,
            usage_status=usage_status,
            est=est,
        )

    if not llm_usage_cost._should_log_llm_cost_debug():
        return

    line = llm_usage_cost._format_llm_cost_kv_line(
        scope="call",
        feature=feature,
        provider=provider,
        resolved_model=resolved_model or "unknown",
        call_kind=call_kind,
        normalized_usage=normalized_usage,
        usage_status=usage_status,
        est=est,
        trace_id=trace_id,
    )
    logger.info(line)


def log_selection_schedule_request_llm_cost(
    *,
    feature: str,
    source_url: str,
    aggregated_usage: dict[str, int],
    resolved_models: list[str],
) -> None:
    if not llm_usage_cost._should_log_llm_cost_debug():
        return
    if not aggregated_usage and not resolved_models:
        return
    models_unique = ",".join(dict.fromkeys(m for m in resolved_models if m)) or "unknown"
    if aggregated_usage:
        normalized_usage = llm_usage_cost._normalize_usage_summary(aggregated_usage)
        if normalized_usage is None:
            normalized_usage = {
                "input_tokens": 0,
                "output_tokens": 0,
                "reasoning_tokens": 0,
                "cached_input_tokens": 0,
            }
        usage_status = "ok"
    else:
        normalized_usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "reasoning_tokens": 0,
            "cached_input_tokens": 0,
        }
        usage_status = "no_usage_reported"

    est = None
    if aggregated_usage and normalized_usage:
        for model in resolved_models:
            if model:
                est = llm_usage_cost.estimate_llm_usage_cost_usd(model, normalized_usage)
                if est is not None:
                    break
        if est is None and resolved_models:
            usage_status = "unavailable_price"

    line = llm_usage_cost._format_llm_cost_kv_line(
        scope="request",
        feature=feature,
        provider="mixed",
        resolved_model=models_unique,
        call_kind="selection_schedule_request",
        normalized_usage=normalized_usage,
        usage_status=usage_status,
        est=est,
        source_url=source_url or "",
    )
    logger.info(f"[選考スケジュール抽出] {line}")


def _sync_provider_clients() -> None:
    llm_providers.get_anthropic_client = get_anthropic_client
    llm_providers.get_openai_client = get_openai_client
    llm_providers.get_google_http_client = get_google_http_client


async def _call_google_generate_content(*args: Any, **kwargs: Any) -> tuple[str, dict[str, Any]]:
    _sync_provider_clients()
    return await llm_providers._call_google_generate_content(*args, **kwargs)


async def _call_claude_raw(*args: Any, **kwargs: Any) -> tuple[str, dict[str, int] | None]:
    _sync_provider_clients()
    return await llm_providers._call_claude_raw(*args, **kwargs)


async def _call_claude_raw_stream(*args: Any, **kwargs: Any) -> Any:
    _sync_provider_clients()
    async for chunk in llm_providers._call_claude_raw_stream(*args, **kwargs):
        yield chunk


async def _call_openai_compatible(
    *args: Any,
    **kwargs: Any,
) -> tuple[dict | None, dict[str, int] | None]:
    _sync_provider_clients()
    return await llm_providers._call_openai_compatible(*args, **kwargs)


async def _call_openai_compatible_raw_text(
    *args: Any,
    **kwargs: Any,
) -> tuple[str, dict[str, int] | None]:
    _sync_provider_clients()
    return await llm_providers._call_openai_compatible_raw_text(*args, **kwargs)


async def _call_openai_responses(
    *args: Any,
    **kwargs: Any,
) -> tuple[dict | None, dict[str, int] | None]:
    _sync_provider_clients()
    return await llm_responses._call_openai_responses(*args, **kwargs)


async def _call_openai_responses_raw_text(
    *args: Any,
    **kwargs: Any,
) -> tuple[str, dict[str, int] | None]:
    _sync_provider_clients()
    return await llm_responses._call_openai_responses_raw_text(*args, **kwargs)


def _json_repair_system_prompt(*, require_valid: bool = False) -> str:
    if require_valid:
        return "あなたはJSON修復の専門家です。必ず有効なJSONのみを返してください。"
    return "あなたはJSON修復の専門家です。必ずJSONのみ出力してください。"


def _json_repair_user_prompt(repair_source: str) -> str:
    return (
        "以下のテキストを有効なJSONに修復してください。JSON以外は出力しないでください。\n\n"
        f"{repair_source}"
    )


async def _repair_json_with_same_model(
    *,
    provider: llm_model_routing.LLMProvider,
    requested_model: str | None,
    raw_response: str,
    json_schema: dict | None,
    feature: str,
    use_responses_api: bool = False,
) -> LLMResult | None:
    repair_source = (raw_response or "").strip()
    if not repair_source:
        return None

    repair_system_prompt = _augment_system_prompt_for_provider_json(
        provider,
        _json_repair_system_prompt(require_valid=True),
        "json_schema",
        json_schema,
    )
    provider_strict_note = ""
    if provider == "google":
        provider_strict_note = (
            "前置きの文章は禁止です。`Here is the JSON` のような説明を書かず、"
            "JSONオブジェクトだけを返してください。"
        )
    repair_user_prompt = (
        "以下の出力は途中で切れているか、JSON形式が崩れています。"
        "与えられた断片と指定スキーマを守り、有効なJSONオブジェクトのみを返してください。"
        f"説明文やコードブロックは禁止です。{provider_strict_note}"
        "足りない箇所は最小限で補ってください。\n\n"
        f"{repair_source[:4000]}"
    )
    return await call_llm_with_error(
        system_prompt=repair_system_prompt,
        user_message=repair_user_prompt,
        messages=None,
        max_tokens=min(1200, max(200, len(repair_source) * 2)),
        temperature=0.1,
        model=requested_model,
        feature=feature,
        response_format="json_schema",
        json_schema=json_schema,
        use_responses_api=use_responses_api,
        retry_on_parse=False,
        disable_fallback=True,
    )


async def _repair_json_with_openai_model(
    *,
    raw_response: str,
    json_schema: dict | None,
    feature: str,
    repair_model: llm_model_routing.LLMModel,
    use_responses_api: bool = False,
    parse_retry_instructions: Optional[str] = None,
) -> LLMResult | None:
    if not settings.openai_api_key:
        return None
    repair_source = (raw_response or "").strip()
    if not repair_source:
        return None

    base_repair = _json_repair_system_prompt(require_valid=True)
    if parse_retry_instructions:
        base_repair = f"{base_repair}\n\n# JSON出力の厳守\n{parse_retry_instructions}"
    repair_system_prompt = _augment_system_prompt_for_provider_json(
        "openai",
        base_repair,
        "json_schema",
        json_schema,
    )
    repair_user_prompt = (
        "以下の出力は途中で切れているか、JSON形式が崩れています。"
        "与えられた断片と指定スキーマを守り、有効なJSONオブジェクトのみを返してください。"
        "説明文やコードブロックは禁止です。"
        "足りない箇所は最小限で補ってください。\n\n"
        f"{repair_source[:4000]}"
    )
    return await call_llm_with_error(
        system_prompt=repair_system_prompt,
        user_message=repair_user_prompt,
        messages=None,
        max_tokens=REPAIR_JSON_OPENAI_MAX_TOKENS,
        temperature=0.1,
        model=repair_model,
        feature=feature,
        response_format="json_schema",
        json_schema=json_schema,
        use_responses_api=use_responses_api,
        retry_on_parse=False,
        disable_fallback=True,
    )


async def _call_claude(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str | None = None,
    feature: str = "unknown",
) -> dict | None:
    content, _ = await _call_claude_raw(
        system_prompt=system_prompt,
        user_message=user_message,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
        feature=feature,
    )
    if not content:
        return None
    _emit_output_leakage_event(
        feature=feature,
        model=model or "",
        provider="anthropic",
        raw_text=content,
    )
    return _parse_json_response(content)


def _emit_fallback_event(
    feature: str,
    primary_model: str,
    selected_model: str,
    failure_reason: str,
    latency_ms: int,
    primary_provider: str,
) -> None:
    logger.info(
        json.dumps(
            {
                "event": "llm.fallback.triggered",
                "feature": feature,
                "primary_model": primary_model,
                "selected_model": selected_model,
                "failure_reason": failure_reason,
                "latency_ms": latency_ms,
                "circuit_state": (
                    (
                        "open"
                        if llm_client_registry.get_circuit_breaker(primary_provider).is_open()
                        else "closed"
                    )
                    if primary_provider in ("anthropic", "openai")
                    else "closed"
                ),
            }
        )
    )


async def call_llm_with_error(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: llm_model_routing.LLMModel | None = None,
    feature: str | None = None,
    response_format: llm_model_routing.ResponseFormat = "json_object",
    json_schema: dict | None = None,
    use_responses_api: bool = False,
    retry_on_parse: bool = False,
    parse_retry_instructions: Optional[str] = None,
    disable_fallback: bool = False,
) -> LLMResult:
    feature = feature or "unknown"
    requested_model = model or llm_model_routing.get_model_config().get(feature, "claude-sonnet")
    start = time.monotonic()
    try:
        target = llm_model_routing._resolve_model_target(feature, requested_model)
    except ValueError as exc:
        error = _create_error("unknown", "openai", feature, str(exc))
        _log(feature, str(exc), ERROR)
        return LLMResult(success=False, error=error)

    if not llm_model_routing._provider_has_api_key(target.provider):
        error = _create_error(
            "no_api_key",
            target.provider,
            feature,
            f"{_provider_display_name(target.provider)} の API キーが未設定です",
        )
        _log(feature, "APIキーが設定されていません", ERROR)
        return LLMResult(success=False, error=error)

    model_display = llm_model_routing.get_model_display_name(target.actual_model)
    _log(feature, f"{model_display} を呼び出し中...")
    normalized_messages, used_user_message = _normalize_chat_messages(messages, user_message)
    message_count = 1 if used_user_message else len(normalized_messages)
    message_chars = (
        len(user_message or "")
        if used_user_message
        else sum(len(str(m.get("content", ""))) for m in normalized_messages)
    )
    message_mode = "user_message" if used_user_message else "messages"
    _log_debug(
        feature,
        "LLM input size: "
        f"system={len(system_prompt)} chars, "
        f"{message_mode}={message_count} items/{message_chars} chars, "
        f"max_tokens={max_tokens}, temperature={temperature}, model={target.actual_model}",
    )

    try:
        effective_use_responses_api = _should_use_openai_responses_api(
            provider=target.provider,
            feature=feature,
            use_responses_api=use_responses_api,
        )
        raw_response: str | None = None
        usage_summary: dict[str, int] | None = None

        if target.provider == "anthropic":
            raw_response, usage_summary = await _call_claude_raw(
                system_prompt,
                user_message,
                normalized_messages,
                max_tokens,
                temperature,
                target.actual_model,
                feature=feature,
            )
            if settings.debug:
                content = raw_response or ""
                _log_debug(
                    feature,
                    "LLM raw response stats: "
                    f"chars={len(content)}, "
                    f"open_braces={content.count('{') - content.count('}')}, "
                    f"open_brackets={content.count('[') - content.count(']')}, "
                    f"unescaped_quotes={content.count(chr(34)) - content.count(chr(92) + chr(34))}, "
                    f"truncation_suspected={_detect_truncation(content)}",
                )
            _emit_output_leakage_event(
                feature=feature,
                model=target.actual_model or "",
                provider="anthropic",
                raw_text=raw_response or "",
            )
            result = _parse_json_response(raw_response or "")
        elif target.provider == "google":
            raw_response, payload = await _call_google_generate_content(
                system_prompt=system_prompt,
                user_message=user_message,
                messages=normalized_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                model=target.actual_model,
                response_format=response_format,
                json_schema=json_schema,
                feature=feature,
            )
            usage_summary = _extract_gemini_usage_summary(payload)
            result = _parse_json_response(raw_response)
        elif effective_use_responses_api:
            result, usage_summary = await _call_openai_responses(
                system_prompt,
                user_message,
                normalized_messages,
                max_tokens,
                temperature,
                target.actual_model,
                response_format=response_format,
                json_schema=json_schema,
                feature=feature,
            )
        else:
            result, usage_summary = await _call_openai_compatible(
                provider=target.provider,
                system_prompt=system_prompt,
                user_message=user_message,
                messages=normalized_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                model=target.actual_model,
                response_format=response_format,
                json_schema=json_schema,
                feature=feature,
            )

        log_llm_cost_event(
            feature=feature,
            provider=target.provider,
            resolved_model=target.actual_model,
            call_kind="structured",
            usage=usage_summary,
        )

        if result is not None:
            _log(feature, f"{model_display} で成功", SUCCESS)
            return LLMResult(
                success=True,
                data=result,
                raw_text=raw_response,
                usage=usage_summary,
                resolved_model=target.actual_model,
            )

        if retry_on_parse:
            repaired = await _repair_after_parse_failure(
                target=target,
                requested_model=requested_model,
                raw_response=raw_response,
                json_schema=json_schema,
                feature=feature,
                max_tokens=max_tokens,
                model_display=model_display,
                use_responses_api=use_responses_api,
                parse_retry_instructions=parse_retry_instructions,
            )
            if repaired and repaired.success and repaired.data:
                return repaired

        error = _create_error("parse", target.provider, feature, "空または解析不能なレスポンス")
        _log(feature, "応答の解析に失敗しました", ERROR)
        return LLMResult(success=False, error=error, raw_text=raw_response)

    except OpenAIResponsesRefusalError as exc:
        error = _create_error("refusal", target.provider, feature, str(exc))
        _log(feature, f"{_provider_display_name(target.provider)} refusal: {exc}", WARNING)
        return LLMResult(success=False, error=error)
    except (AnthropicAPIError, OpenAIAPIError, httpx.HTTPError) as exc:
        return await _handle_provider_error(
            exc,
            target=target,
            requested_model=requested_model,
            feature=feature,
            start=start,
            disable_fallback=disable_fallback,
            retry_call=lambda fallback_model: call_llm_with_error(
                system_prompt=system_prompt,
                user_message=user_message,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                model=fallback_model,
                feature=feature,
                response_format=response_format,
                json_schema=json_schema,
                use_responses_api=use_responses_api,
                retry_on_parse=retry_on_parse,
                parse_retry_instructions=parse_retry_instructions,
                disable_fallback=True,
            ),
        )
    except Exception as exc:
        error_type, detail = _classify_error_for_provider(target.provider, exc)
        error = _create_error(error_type, target.provider, feature, detail)
        _log(feature, f"{_provider_display_name(target.provider)} 予期しないエラー: {exc}", ERROR)
        return LLMResult(success=False, error=error)


async def _repair_after_parse_failure(
    *,
    target: llm_model_routing.ResolvedModelTarget,
    requested_model: llm_model_routing.LLMModel,
    raw_response: str | None,
    json_schema: dict | None,
    feature: str,
    max_tokens: int,
    model_display: str,
    use_responses_api: bool,
    parse_retry_instructions: Optional[str],
) -> LLMResult | None:
    repair_source = raw_response or ""
    if not repair_source:
        return None
    if settings.openai_api_key:
        _log(feature, "JSON解析失敗、GPT mini で修復を試行", WARNING)
        openai_repair = await _repair_json_with_openai_model(
            raw_response=repair_source,
            json_schema=json_schema,
            feature=feature,
            repair_model="gpt-mini",
            use_responses_api=use_responses_api,
            parse_retry_instructions=parse_retry_instructions,
        )
        if openai_repair and openai_repair.success and openai_repair.data:
            _log(feature, "OpenAI でJSON修復成功", SUCCESS)
            return openai_repair

    if target.provider == "anthropic" and not settings.openai_api_key:
        _log(feature, "JSON修復を実行（Claude）", WARNING)
        repair_model = settings.claude_sonnet_model
        if "haiku" in repair_model.lower():
            repair_model = "claude-sonnet-4-5-20250929"
        raw_repair, repair_usage = await _call_claude_raw(
            system_prompt=_json_repair_system_prompt(),
            user_message=_json_repair_user_prompt(repair_source),
            messages=None,
            max_tokens=min(max_tokens, 2000),
            temperature=0.1,
            model=repair_model,
            feature=feature,
        )
        log_llm_cost_event(
            feature=feature,
            provider="anthropic",
            resolved_model=repair_model,
            call_kind="json_repair",
            usage=repair_usage,
        )
        repair_parsed = _parse_json_response(raw_repair)
        if repair_parsed is not None:
            _log(feature, f"{model_display} でJSON修復成功", SUCCESS)
            return LLMResult(
                success=True,
                data=repair_parsed,
                raw_text=raw_repair,
                resolved_model=repair_model,
            )
    elif target.provider == "google":
        _log(feature, "JSON修復を実行（同一プロバイダー）", WARNING)
        same_model_repair = await _repair_json_with_same_model(
            provider=target.provider,
            requested_model=requested_model,
            raw_response=repair_source,
            json_schema=json_schema,
            feature=feature,
            use_responses_api=use_responses_api,
        )
        if same_model_repair and same_model_repair.success and same_model_repair.data:
            _log(feature, f"{model_display} でJSON修復成功", SUCCESS)
            return same_model_repair
    return None


async def call_llm_text_with_error(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: llm_model_routing.LLMModel | None = None,
    feature: str | None = None,
    use_responses_api: bool = False,
    disable_fallback: bool = False,
) -> LLMResult:
    feature = feature or "unknown"
    requested_model = model or llm_model_routing.get_model_config().get(feature, "claude-sonnet")
    start = time.monotonic()
    try:
        target = llm_model_routing._resolve_model_target(feature, requested_model)
    except ValueError as exc:
        error = _create_error("unknown", "openai", feature, str(exc))
        _log(feature, str(exc), ERROR)
        return LLMResult(success=False, error=error)

    if not llm_model_routing._provider_has_api_key(target.provider):
        error = _create_error(
            "no_api_key",
            target.provider,
            feature,
            f"{_provider_display_name(target.provider)} の API キーが未設定です",
        )
        _log(feature, "APIキーが設定されていません", ERROR)
        return LLMResult(success=False, error=error)

    model_display = llm_model_routing.get_model_display_name(target.actual_model)
    _log(feature, f"{model_display} を呼び出し中...")
    normalized_messages, used_user_message = _normalize_chat_messages(messages, user_message)
    message_count = 1 if used_user_message else len(normalized_messages)
    message_chars = (
        len(user_message or "")
        if used_user_message
        else sum(len(str(m.get("content", ""))) for m in normalized_messages)
    )
    _log_debug(
        feature,
        "LLM input size: "
        f"system={len(system_prompt)} chars, "
        f"{'user_message' if used_user_message else 'messages'}={message_count} items/{message_chars} chars, "
        f"max_tokens={max_tokens}, temperature={temperature}, model={target.actual_model}",
    )

    try:
        raw_response = ""
        usage_summary: dict[str, int] | None = None
        if target.provider == "anthropic":
            raw_response, usage_summary = await _call_claude_raw(
                system_prompt,
                user_message,
                normalized_messages,
                max_tokens,
                temperature,
                target.actual_model,
                feature=feature,
            )
            _emit_output_leakage_event(
                feature=feature,
                model=target.actual_model or "",
                provider="anthropic",
                raw_text=raw_response,
            )
        elif target.provider == "google":
            raw_response, payload = await _call_google_generate_content(
                system_prompt=_augment_system_prompt_for_provider_text(
                    target.provider,
                    system_prompt,
                    feature=feature,
                ),
                user_message=user_message,
                messages=normalized_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                model=target.actual_model,
                response_format="text",
                feature=feature,
            )
            usage_summary = _extract_gemini_usage_summary(payload)
        elif target.provider == "openai" and feature == "es_review":
            raw_response, usage_summary = await _call_openai_compatible_raw_text(
                provider="openai",
                system_prompt=system_prompt,
                user_message=user_message,
                messages=normalized_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                model=target.actual_model,
                feature=feature,
            )
        elif _should_use_openai_responses_api(
            provider=target.provider,
            feature=feature,
            use_responses_api=use_responses_api,
        ):
            raw_response, usage_summary = await _call_openai_responses_raw_text(
                system_prompt,
                user_message,
                normalized_messages,
                max_tokens,
                temperature,
                target.actual_model,
                feature=feature,
            )
        else:
            raw_response, usage_summary = await _call_openai_compatible_raw_text(
                provider=target.provider,
                system_prompt=system_prompt,
                user_message=user_message,
                messages=normalized_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                model=target.actual_model,
                feature=feature,
            )

        log_llm_cost_event(
            feature=feature,
            provider=target.provider,
            resolved_model=target.actual_model,
            call_kind="text",
            usage=usage_summary,
        )

        text_response = raw_response.strip() if raw_response else None
        if text_response:
            _log(feature, f"{model_display} で成功", SUCCESS)
            return LLMResult(
                success=True,
                data={"text": text_response},
                raw_text=raw_response,
                usage=usage_summary,
                resolved_model=target.actual_model,
            )

        if not disable_fallback:
            fallback_result = await _try_text_fallback(
                feature=feature,
                target=target,
                system_prompt=system_prompt,
                user_message=user_message,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                use_responses_api=use_responses_api,
            )
            if fallback_result:
                return fallback_result

        error = _create_error("parse", target.provider, feature, "空のテキストレスポンス")
        _log(feature, "応答の解析に失敗しました", ERROR)
        return LLMResult(success=False, error=error, raw_text=raw_response)

    except (AnthropicAPIError, OpenAIAPIError, httpx.HTTPError) as exc:
        return await _handle_provider_error(
            exc,
            target=target,
            requested_model=requested_model,
            feature=feature,
            start=start,
            disable_fallback=disable_fallback,
            retry_call=lambda fallback_model: call_llm_text_with_error(
                system_prompt=system_prompt,
                user_message=user_message,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                model=fallback_model,
                feature=feature,
                use_responses_api=use_responses_api,
                disable_fallback=True,
            ),
        )
    except Exception as exc:
        error_type, detail = _classify_error_for_provider(target.provider, exc)
        error = _create_error(error_type, target.provider, feature, detail)
        _log(feature, f"{_provider_display_name(target.provider)} 予期しないエラー: {exc}", ERROR)
        return LLMResult(success=False, error=error)


async def _try_text_fallback(
    *,
    feature: str,
    target: llm_model_routing.ResolvedModelTarget,
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    use_responses_api: bool,
) -> LLMResult | None:
    fallback_model = llm_model_routing._feature_cross_fallback_model(feature, target.provider)
    if not fallback_model:
        return None
    _log(feature, f"空応答、{fallback_model} にフォールバック", WARNING)
    try:
        fallback_result = await call_llm_text_with_error(
            system_prompt=system_prompt,
            user_message=user_message,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            model=fallback_model,
            feature=feature,
            use_responses_api=use_responses_api,
            disable_fallback=True,
        )
        if fallback_result.success and fallback_result.data:
            _log(feature, f"{fallback_model} へのフォールバック成功", SUCCESS)
            return fallback_result
    except Exception as fallback_err:
        _log(feature, f"{fallback_model} フォールバック失敗: {fallback_err}", ERROR)
    return None


async def _handle_provider_error(
    exc: Exception,
    *,
    target: llm_model_routing.ResolvedModelTarget,
    requested_model: llm_model_routing.LLMModel,
    feature: str,
    start: float,
    disable_fallback: bool,
    retry_call: Any,
) -> LLMResult:
    error_type, detail = _classify_error_for_provider(target.provider, exc)
    fallback_model = None
    if not disable_fallback and error_type not in {"billing"}:
        fallback_model = llm_model_routing._feature_cross_fallback_model(feature, target.provider)
    if fallback_model:
        latency_ms = int((time.monotonic() - start) * 1000)
        _emit_fallback_event(
            feature=feature,
            primary_model=str(requested_model),
            selected_model=fallback_model,
            failure_reason=error_type,
            latency_ms=latency_ms,
            primary_provider=target.provider,
        )
        _log(
            feature,
            f"{_provider_display_name(target.provider)} {error_type}、{fallback_model} にフォールバック",
            WARNING,
        )
        try:
            fallback_result = await retry_call(fallback_model)
            if fallback_result.success and fallback_result.data:
                _log(feature, f"{fallback_model} へのフォールバック成功", SUCCESS)
                return fallback_result
        except Exception as fallback_err:
            _log(feature, f"{fallback_model} フォールバック失敗: {fallback_err}", ERROR)

    error = _create_error(error_type, target.provider, feature, detail)
    _log(feature, f"{_provider_display_name(target.provider)} APIエラー: {detail}", ERROR)
    return LLMResult(success=False, error=error)
