"""
OpenAI Responses API 固有のユーティリティモジュール

OpenAI Responses API の呼び出し、レスポンス解析、リファザル検出、
PDF OCR 機能などを提供する。
llm.py から分離し、循環インポートを避けるため llm.py への参照は
関数内の遅延インポートで行う。
"""

import asyncio
import base64
from openai import APIError as OpenAIAPIError
from app.config import settings
from app.utils import llm_providers
from app.utils.llm_providers import (
    _is_rag_feature,
    _normalize_chat_messages,
    _openai_supports_temperature,
    _parse_json_response,
    _log,
    _log_debug,
    WARNING,
    ERROR,
)
from app.utils.llm_model_routing import (
    LLMProvider,
    ResponseFormat,
    _resolve_openai_model,
)
from app.utils.secure_logger import get_logger
from typing import Any

logger = get_logger(__name__)


class OpenAIResponsesRefusalError(RuntimeError):
    """Structured Outputs refusal surfaced by the Responses API."""


def _should_use_openai_responses_api(
    *,
    provider: LLMProvider,
    feature: str,
    use_responses_api: bool,
) -> bool:
    if provider != "openai":
        return False
    return use_responses_api or feature in {"es_review", "interview", "interview_feedback"}


def _openai_incomplete_due_to_max_output(response: Any) -> bool:
    if getattr(response, "status", None) != "incomplete":
        return False
    details = getattr(response, "incomplete_details", None)
    if details is None:
        return False
    reason = getattr(details, "reason", None)
    if reason is None and isinstance(details, dict):
        reason = details.get("reason")
    return reason == "max_output_tokens"


def _openai_structured_retry_max_output(feature: str, current_max: int) -> int:
    if feature == "es_review":
        return min(max(current_max * 4, 2048), 16384)
    if feature == "interview_feedback":
        return min(max(current_max * 2, 2000), 2400)
    if feature == "interview":
        return min(max(current_max * 2, 1400), 2400)
    return current_max


def _extract_openai_visible_text(response: Any) -> str:
    """Collect user-visible text from a Responses API result (output_text or message items)."""
    out = getattr(response, "output_text", None)
    if isinstance(out, str) and out.strip():
        return out
    parts: list[str] = []
    for block in getattr(response, "output", None) or []:
        btype = getattr(block, "type", None)
        if btype is None and isinstance(block, dict):
            btype = block.get("type")
        if btype == "reasoning":
            continue
        content_items = getattr(block, "content", None)
        if content_items is None and isinstance(block, dict):
            content_items = block.get("content")
        if not content_items:
            continue
        for item in content_items:
            if isinstance(item, dict):
                t = item.get("text") or item.get("output_text")
            else:
                t = getattr(item, "text", None) or getattr(item, "output_text", None)
            if isinstance(t, str) and t:
                parts.append(t)
    return "".join(parts) if parts else ""


def _extract_openai_usage_summary(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None) or {}

    def _extract(value: Any, *keys: str) -> int:
        current = value
        for key in keys:
            if isinstance(current, dict):
                current = current.get(key)
            else:
                current = getattr(current, key, None)
            if current is None:
                return 0
        return int(current or 0)

    return {
        "input_tokens": _extract(usage, "input_tokens"),
        "output_tokens": _extract(usage, "output_tokens"),
        "reasoning_tokens": _extract(usage, "output_tokens_details", "reasoning_tokens"),
        "cached_input_tokens": _extract(usage, "input_tokens_details", "cached_tokens"),
    }


def _log_openai_usage_summary(feature: str, response: Any) -> None:
    usage_summary = _extract_openai_usage_summary(response)
    _log_debug(
        feature,
        "OpenAI Responses API usage: "
        f"input={usage_summary['input_tokens']}, "
        f"output={usage_summary['output_tokens']}, "
        f"reasoning={usage_summary['reasoning_tokens']}, "
        f"cached_input={usage_summary['cached_input_tokens']}",
    )


def _parse_openai_responses_json_payload(
    response: Any,
    feature: str,
) -> tuple[dict | None, list[object]]:
    """Return parsed JSON dict if found, else None and candidate fragments for logging."""
    parsed_early = getattr(response, "output_parsed", None)
    if isinstance(parsed_early, dict):
        return parsed_early, []

    candidates: list[object] = []
    try:
        output_items = getattr(response, "output", None) or []
        for output in output_items:
            content_items = getattr(output, "content", None)
            if content_items is None and isinstance(output, dict):
                content_items = output.get("content")
            if not content_items:
                continue

            for item in content_items:
                if isinstance(item, dict):
                    parsed_payload = item.get("parsed")
                    if isinstance(parsed_payload, dict):
                        return parsed_payload, candidates
                    json_payload = item.get("json")
                    if json_payload is not None:
                        if isinstance(json_payload, dict):
                            return json_payload, candidates
                        if isinstance(json_payload, str):
                            candidates.append(json_payload)
                        elif not callable(json_payload):
                            candidates.append(str(json_payload))
                    text_payload = item.get("text") or item.get("output_text")
                    if isinstance(text_payload, str) and text_payload:
                        candidates.append(text_payload)
                else:
                    parsed_payload = getattr(item, "parsed", None)
                    if isinstance(parsed_payload, dict):
                        return parsed_payload, candidates
                    json_payload = getattr(item, "json", None)
                    if json_payload is not None:
                        if isinstance(json_payload, dict):
                            return json_payload, candidates
                        if isinstance(json_payload, str):
                            candidates.append(json_payload)
                        elif not callable(json_payload):
                            candidates.append(str(json_payload))
                    text_payload = getattr(item, "text", None) or getattr(
                        item, "output_text", None
                    )
                    if isinstance(text_payload, str) and text_payload:
                        candidates.append(text_payload)

        content = getattr(response, "output_text", None)
        if isinstance(content, str) and content.strip():
            candidates.append(content)

        for candidate in candidates:
            if isinstance(candidate, dict):
                return candidate, candidates
            if isinstance(candidate, str):
                parsed = _parse_json_response(candidate)
                if parsed is not None:
                    return parsed, candidates
    except Exception as e:
        _log(feature, f"Responses API JSON抽出エラー: {e}", ERROR)

    return None, candidates


def _extract_openai_responses_refusal(response: Any) -> str | None:
    refusal = getattr(response, "refusal", None)
    if isinstance(refusal, str) and refusal.strip():
        return refusal.strip()

    for output in getattr(response, "output", None) or []:
        block_refusal = getattr(output, "refusal", None)
        if isinstance(block_refusal, str) and block_refusal.strip():
            return block_refusal.strip()
        if isinstance(output, dict):
            dict_refusal = output.get("refusal")
            if isinstance(dict_refusal, str) and dict_refusal.strip():
                return dict_refusal.strip()

        content_items = getattr(output, "content", None)
        if content_items is None and isinstance(output, dict):
            content_items = output.get("content")
        if not content_items:
            continue

        for item in content_items:
            if isinstance(item, dict):
                item_refusal = item.get("refusal")
                if isinstance(item_refusal, str) and item_refusal.strip():
                    return item_refusal.strip()
                if item.get("type") == "refusal":
                    text = item.get("text") or item.get("output_text")
                    if isinstance(text, str) and text.strip():
                        return text.strip()
                    return "refusal"
            else:
                item_refusal = getattr(item, "refusal", None)
                if isinstance(item_refusal, str) and item_refusal.strip():
                    return item_refusal.strip()
                if getattr(item, "type", None) == "refusal":
                    text = getattr(item, "text", None) or getattr(item, "output_text", None)
                    if isinstance(text, str) and text.strip():
                        return text.strip()
                    return "refusal"

    return None


def _log_openai_empty_json_attempt(
    feature: str,
    response: Any,
    candidates: list[object],
) -> None:
    if candidates:
        _log(
            feature,
            f"OpenAI Responses 空のJSON (候補数={len(candidates)})",
            WARNING,
        )
        for i, c in enumerate(candidates[:2]):
            preview = str(c)[:200] if c else "(empty)"
            _log(feature, f"候補{i + 1}プレビュー: {preview}...", WARNING)
    else:
        output_text = getattr(response, "output_text", None) if response else None
        _log(
            feature,
            "OpenAI Responses から空のJSON "
            f"(output_text: {str(output_text)[:100] if output_text else 'None'})",
            WARNING,
        )


async def _call_openai_responses(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    response_format: ResponseFormat = "json_schema",
    json_schema: dict | None = None,
    feature: str = "unknown",
) -> tuple[dict | None, dict[str, int] | None]:
    """OpenAI Responses APIを呼び出す（オプションでStructured Outputs対応）。"""
    client = await llm_providers.get_openai_client(for_rag=_is_rag_feature(feature))
    normalized_messages, _ = _normalize_chat_messages(messages, user_message)
    input_messages = [{"role": "system", "content": system_prompt}] + normalized_messages

    text_format = None
    if response_format == "json_schema" and json_schema:
        schema_name = json_schema.get("name", "response")
        schema_body = json_schema.get("schema", json_schema)
        text_format = {
            "type": "json_schema",
            "name": schema_name,
            "schema": schema_body,
            "strict": True,
        }
    elif response_format == "text":
        text_format = {"type": "text"}

    request_kwargs: dict[str, Any] = {
        "model": model,
        "input": input_messages,
        "max_output_tokens": max_tokens,
    }
    if _openai_supports_temperature(model):
        request_kwargs["temperature"] = temperature
    if text_format:
        request_kwargs["text"] = {"format": text_format}

    effective_max = max_tokens
    last_candidates: list[object] = []
    response: Any = None
    usage_summary: dict[str, int] | None = None

    for attempt in range(2):
        request_kwargs["max_output_tokens"] = effective_max
        response = await client.responses.create(**request_kwargs)
        _log_openai_usage_summary(feature, response)
        usage_summary = _extract_openai_usage_summary(response)

        if settings.debug:
            output_text = getattr(response, "output_text", None)
            output_text_len = len(output_text) if isinstance(output_text, str) else 0
            _log_debug(
                feature,
                f"OpenAI Responses API summary: output_text_len={output_text_len}",
            )

        refusal = _extract_openai_responses_refusal(response)
        if refusal:
            raise OpenAIResponsesRefusalError(refusal)

        parsed, last_candidates = _parse_openai_responses_json_payload(response, feature)
        if parsed is not None:
            return parsed, usage_summary

        if settings.debug:
            _log_debug(
                feature,
                f"OpenAI Responses API candidates: count={len(last_candidates)}",
            )

        if (
            attempt == 0
            and _openai_incomplete_due_to_max_output(response)
            and feature in {"es_review", "interview", "interview_feedback"}
        ):
            boosted = _openai_structured_retry_max_output(feature, effective_max)
            if boosted > effective_max:
                _log(
                    feature,
                    f"OpenAI Responses incomplete (max_output_tokens); "
                    f"内部リトライ max_output_tokens={boosted}",
                    WARNING,
                )
                effective_max = boosted
                continue
        break

    _log_openai_empty_json_attempt(feature, response, last_candidates)
    return None, usage_summary


async def _call_openai_responses_raw_text(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    feature: str = "unknown",
) -> tuple[str, dict[str, int] | None]:
    """OpenAI Responses APIを呼び出し、生テキストを返す。"""
    client = await llm_providers.get_openai_client(for_rag=_is_rag_feature(feature))
    normalized_messages, _ = _normalize_chat_messages(messages, user_message)
    input_messages = [{"role": "system", "content": system_prompt}] + normalized_messages

    async def _create(max_out: int) -> Any:
        kwargs: dict[str, Any] = {
            "model": model,
            "input": input_messages,
            "max_output_tokens": max_out,
            "text": {"format": {"type": "text"}},
        }
        if feature == "es_review":
            kwargs["verbosity"] = "medium"
        if _openai_supports_temperature(model):
            kwargs["temperature"] = temperature
        return await client.responses.create(**kwargs)

    effective_max = max_tokens
    usage_summary: dict[str, int] | None = None
    response: Any = None

    for attempt in range(2):
        response = await _create(effective_max)

        _log_openai_usage_summary(feature, response)
        usage_summary = _extract_openai_usage_summary(response)

        text = _extract_openai_visible_text(response)
        if text.strip():
            return text, usage_summary

        if (
            attempt == 0
            and _openai_incomplete_due_to_max_output(response)
            and feature == "es_review"
        ):
            boosted = min(max(effective_max * 4, 2048), 16384)
            if boosted > effective_max:
                _log(
                    feature,
                    f"OpenAI Responses テキスト incomplete (max_output_tokens); "
                    f"内部リトライ max_output_tokens={boosted}",
                    WARNING,
                )
                effective_max = boosted
                continue
        break

    if response is not None:
        _log(
            feature,
            "OpenAI Responses テキストが空 (output 走査後も未取得)",
            WARNING,
        )
    return "", usage_summary


async def extract_text_from_pdf_with_openai(
    pdf_bytes: bytes,
    filename: str,
    *,
    model: str | None = None,
    max_output_tokens: int = 12000,
    feature: str = "company_info",
    timeout_seconds: float | None = None,
) -> tuple[str, dict[str, int], str]:
    """
    Extract readable text from a PDF using OpenAI Responses API.

    Used as an OCR-capable fallback for uploaded PDFs, including scanned
    documents where local text extraction is unavailable or insufficient.

    Returns (text, usage_summary, resolved_model_id). usage_summary is zeroed when no API call.
    """
    from app.utils.llm import log_llm_cost_event  # local import to break cycle

    empty_usage: dict[str, int] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "cached_input_tokens": 0,
    }
    if not pdf_bytes:
        return "", empty_usage, ""

    client = await llm_providers.get_openai_client(for_rag=_is_rag_feature(feature))
    model_name = model or _resolve_openai_model(feature)
    file_b64 = base64.b64encode(pdf_bytes).decode("ascii")

    request_kwargs = {
        "model": model_name,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "以下のPDFから、読める本文をできるだけ漏れなく抽出してください。"
                            "見出し・箇条書き・表の主要テキストは保持し、説明や要約は加えず、"
                            "プレーンテキストのみを返してください。"
                        ),
                    },
                    {
                        "type": "input_file",
                        "filename": filename or "document.pdf",
                        "file_data": f"data:application/pdf;base64,{file_b64}",
                    },
                ],
            }
        ],
        "max_output_tokens": max_output_tokens,
        "text": {"format": {"type": "text"}},
    }
    if _openai_supports_temperature(model_name):
        request_kwargs["temperature"] = 0

    timeout = timeout_seconds
    if timeout is None:
        timeout = float(settings.rag_pdf_ocr_timeout_seconds)

    try:
        response = await asyncio.wait_for(
            client.responses.create(**request_kwargs),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        _log(feature, f"OpenAI PDF OCR timed out after {timeout}s", WARNING)
        return "", empty_usage, model_name

    pdf_usage = _extract_openai_usage_summary(response)
    log_llm_cost_event(
        feature=feature,
        provider="openai",
        resolved_model=model_name,
        call_kind="pdf_ocr",
        usage=pdf_usage,
    )
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text, pdf_usage, model_name

    output_items = getattr(response, "output", None) or []
    for output in output_items:
        content_items = getattr(output, "content", None)
        if content_items is None and isinstance(output, dict):
            content_items = output.get("content")
        if not content_items:
            continue
        for item in content_items:
            if isinstance(item, dict):
                text_payload = item.get("text") or item.get("output_text")
            else:
                text_payload = getattr(item, "text", None) or getattr(
                    item, "output_text", None
                )
            if isinstance(text_payload, str) and text_payload.strip():
                return text_payload, pdf_usage, model_name

    return "", pdf_usage, model_name
