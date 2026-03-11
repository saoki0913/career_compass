"""Qwen3 ES review beta client backed by an OpenAI-compatible endpoint."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import openai
from openai import APIError as OpenAIAPIError

from app.config import settings
from app.utils.llm import LLMError, LLMResult, _parse_json_response

logger = logging.getLogger(__name__)

QWEN_PROVIDER_NAME = "qwen-es-review"

_qwen_client: Optional[openai.AsyncOpenAI] = None
_qwen_lock = asyncio.Lock()


def is_qwen_es_review_enabled() -> bool:
    """Return whether the Qwen3 ES review beta route is configured."""
    return bool(
        settings.qwen_es_review_enabled
        and settings.qwen_es_review_base_url.strip()
        and resolve_qwen_es_review_model_name()
    )


def resolve_qwen_es_review_model_name() -> str:
    """Allow deployments to expose either a model alias or a static adapter ID."""
    adapter_id = settings.qwen_es_review_adapter_id.strip()
    if adapter_id:
        return adapter_id
    return settings.qwen_es_review_model.strip()


def _normalize_base_url(base_url: str) -> str:
    return base_url.strip().rstrip("/")


def _extract_text_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            else:
                text = getattr(item, "text", None)
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def _create_qwen_error(
    error_type: str,
    feature: str,
    detail: str = "",
) -> LLMError:
    messages = {
        "disabled": "Qwen3 ES添削 beta はまだ有効化されていません。",
        "no_api_key": "Qwen3 ES添削 beta の接続設定が不足しています。",
        "network": "Qwen3 ES添削 beta への接続に失敗しました。推論サービスを確認してください。",
        "parse": "Qwen3 ES添削 beta の応答を解析できませんでした。",
        "rate_limit": "Qwen3 ES添削 beta が混雑しています。少し待ってから再試行してください。",
        "unknown": "Qwen3 ES添削 beta の処理中にエラーが発生しました。",
    }
    return LLMError(
        error_type=error_type,
        message=messages.get(error_type, messages["unknown"]),
        detail=detail,
        provider=QWEN_PROVIDER_NAME,
        feature=feature,
    )


async def get_qwen_es_review_client() -> openai.AsyncOpenAI:
    """Create a singleton OpenAI-compatible client for the Qwen service."""
    global _qwen_client

    async with _qwen_lock:
        if _qwen_client is None:
            _qwen_client = openai.AsyncOpenAI(
                api_key=settings.qwen_es_review_api_key or "qwen-es-review-local",
                base_url=_normalize_base_url(settings.qwen_es_review_base_url),
                timeout=settings.qwen_es_review_timeout_seconds,
            )
        return _qwen_client


async def _call_qwen_chat_completion(
    *,
    system_prompt: str,
    user_message: str,
    max_tokens: int,
    temperature: float,
    json_schema: dict | None = None,
) -> str:
    client = await get_qwen_es_review_client()
    model_name = resolve_qwen_es_review_model_name()
    request_kwargs: dict[str, object] = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    if json_schema:
        schema_body = (
            json_schema.get("schema", json_schema)
            if isinstance(json_schema, dict)
            else json_schema
        )
        request_kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "es_review_response",
                "schema": schema_body,
            },
        }

    response = await client.chat.completions.create(**request_kwargs)
    content = response.choices[0].message.content if response.choices else ""
    return _extract_text_content(content).strip()


async def call_qwen_es_review_json_with_error(
    *,
    system_prompt: str,
    user_message: str,
    max_tokens: int = 2000,
    temperature: float = 0.2,
    response_format: str = "json_schema",
    json_schema: dict | None = None,
    feature: str = "es_review_qwen_beta",
    retry_on_parse: bool = False,
    disable_fallback: bool = True,
) -> LLMResult:
    """Call the Qwen3 beta model and parse JSON output."""
    if not is_qwen_es_review_enabled():
        return LLMResult(
            success=False,
            error=_create_qwen_error("disabled", feature, "Qwen beta settings are incomplete"),
        )

    try:
        raw_text = await _call_qwen_chat_completion(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
            json_schema=json_schema,
        )
        parsed = _parse_json_response(raw_text)
        if parsed is not None:
            logger.info("[Qwen ES Review] JSON completion success: feature=%s", feature)
            return LLMResult(success=True, data=parsed, raw_text=raw_text)

        if retry_on_parse:
            retry_prompt = (
                f"{system_prompt}\n\n# JSON出力の厳守\n"
                "必ず有効なJSONのみを返してください。説明文やコードブロックは禁止です。"
            )
            raw_retry = await _call_qwen_chat_completion(
                system_prompt=retry_prompt,
                user_message=user_message,
                max_tokens=max_tokens,
                temperature=0.1,
                json_schema=json_schema,
            )
            retry_parsed = _parse_json_response(raw_retry)
            if retry_parsed is not None:
                logger.info("[Qwen ES Review] JSON completion retry success: feature=%s", feature)
                return LLMResult(success=True, data=retry_parsed, raw_text=raw_retry)
            raw_text = raw_retry or raw_text

        logger.warning("[Qwen ES Review] JSON parse failed: feature=%s", feature)
        return LLMResult(
            success=False,
            error=_create_qwen_error("parse", feature, "empty or invalid JSON response"),
            raw_text=raw_text,
        )
    except OpenAIAPIError as error:
        error_text = str(error).lower()
        if "rate limit" in error_text or "429" in error_text:
            error_type = "rate_limit"
        elif "connection" in error_text or "timeout" in error_text or "network" in error_text:
            error_type = "network"
        else:
            error_type = "unknown"
        logger.error("[Qwen ES Review] API error: %s", error)
        return LLMResult(
            success=False,
            error=_create_qwen_error(error_type, feature, str(error)),
        )
    except Exception as error:  # pragma: no cover - defensive logging path
        logger.error("[Qwen ES Review] unexpected error: %s", error)
        return LLMResult(
            success=False,
            error=_create_qwen_error("unknown", feature, str(error)),
        )


async def call_qwen_es_review_text_with_error(
    *,
    system_prompt: str,
    user_message: str,
    max_tokens: int = 2000,
    temperature: float = 0.2,
    feature: str = "es_review_qwen_beta",
    disable_fallback: bool = True,
) -> LLMResult:
    """Call the Qwen3 beta model and return plain text output."""
    if not is_qwen_es_review_enabled():
        return LLMResult(
            success=False,
            error=_create_qwen_error("disabled", feature, "Qwen beta settings are incomplete"),
        )

    try:
        raw_text = await _call_qwen_chat_completion(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
            json_schema=None,
        )
        if raw_text:
            logger.info("[Qwen ES Review] text completion success: feature=%s", feature)
            return LLMResult(success=True, data={"text": raw_text}, raw_text=raw_text)

        return LLMResult(
            success=False,
            error=_create_qwen_error("parse", feature, "empty text response"),
            raw_text=raw_text,
        )
    except OpenAIAPIError as error:
        error_text = str(error).lower()
        if "rate limit" in error_text or "429" in error_text:
            error_type = "rate_limit"
        elif "connection" in error_text or "timeout" in error_text or "network" in error_text:
            error_type = "network"
        else:
            error_type = "unknown"
        logger.error("[Qwen ES Review] API error: %s", error)
        return LLMResult(
            success=False,
            error=_create_qwen_error(error_type, feature, str(error)),
        )
    except Exception as error:  # pragma: no cover - defensive logging path
        logger.error("[Qwen ES Review] unexpected error: %s", error)
        return LLMResult(
            success=False,
            error=_create_qwen_error("unknown", feature, str(error)),
        )
