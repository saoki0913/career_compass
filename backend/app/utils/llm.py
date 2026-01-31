"""
LLM Utility Module

Provides a unified interface for calling different LLM providers:
- Claude Sonnet (primary for ES review, Gakuchika)
- OpenAI (for company info extraction and RAG utilities)

Supports automatic model selection based on feature, with fallback logic.
"""

from anthropic import AsyncAnthropic, APIError as AnthropicAPIError
import openai
from openai import APIError as OpenAIAPIError
from app.config import settings
import json
from typing import Literal, Optional
from dataclasses import dataclass

# Global clients for connection pooling
_anthropic_client: Optional[AsyncAnthropic] = None
_anthropic_client_rag: Optional[AsyncAnthropic] = None
_openai_client: Optional[openai.AsyncOpenAI] = None
_openai_client_rag: Optional[openai.AsyncOpenAI] = None


def get_anthropic_client(for_rag: bool = False) -> AsyncAnthropic:
    """Get or create Anthropic client with connection pooling."""
    global _anthropic_client, _anthropic_client_rag
    if for_rag:
        if _anthropic_client_rag is None:
            _anthropic_client_rag = AsyncAnthropic(
                api_key=settings.anthropic_api_key,
                timeout=settings.rag_timeout_seconds
            )
        return _anthropic_client_rag
    else:
        if _anthropic_client is None:
            _anthropic_client = AsyncAnthropic(
                api_key=settings.anthropic_api_key,
                timeout=settings.llm_timeout_seconds
            )
        return _anthropic_client


def get_openai_client(for_rag: bool = False) -> openai.AsyncOpenAI:
    """Get or create OpenAI client with connection pooling."""
    global _openai_client, _openai_client_rag
    if for_rag:
        if _openai_client_rag is None:
            _openai_client_rag = openai.AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.rag_timeout_seconds
            )
        return _openai_client_rag
    else:
        if _openai_client is None:
            _openai_client = openai.AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.llm_timeout_seconds
            )
        return _openai_client


LLMModel = Literal["claude-sonnet", "claude-haiku", "openai", "gpt-4o-mini", "gpt-5-mini", "gpt-5-nano"]
ResponseFormat = Literal["json_object", "json_schema", "text"]

# Feature-based model configuration
MODEL_CONFIG: dict[str, LLMModel] = {
    "es_review": "claude-sonnet",      # High-quality review and rewrite
    "gakuchika": "claude-sonnet",      # Interactive deep-dive questions
    "selection_schedule": "claude-haiku",    # Selection schedule extraction
    "selection_schedule_legacy": "claude-haiku",  # Legacy endpoint (compat)
    "rag_query": "claude-sonnet",      # Query expansion for RAG
    "rag_rerank": "claude-sonnet",     # Reranking for RAG
    "rag_classify": "claude-sonnet",   # Content classification for RAG
}

# Feature name mapping for error messages and logs
FEATURE_NAMES = {
    "es_review": "ES添削",
    "gakuchika": "ガクチカ深掘り",
    "selection_schedule": "選考スケジュール抽出",
    "selection_schedule_legacy": "選考スケジュール抽出（旧API）",
    "rag_query": "RAGクエリ拡張",
    "rag_rerank": "RAG再ランキング",
    "rag_classify": "RAGコンテンツ分類",
}

# Log markers
SUCCESS = "✅"
WARNING = "⚠️"
ERROR = "❌"
INFO = "ℹ️"


def get_model_display_name(model: str) -> str:
    """Convert model ID to readable display name."""
    model_lower = model.lower()
    if "claude" in model_lower:
        if "haiku" in model_lower:
            return "Claude Haiku 4.5"
        elif "sonnet" in model_lower:
            return "Claude Sonnet 4"
        elif "opus" in model_lower:
            return "Claude Opus 4"
        return f"Claude ({model})"
    if "gpt-5" in model_lower:
        if "mini" in model_lower:
            return "GPT-5 Mini"
        if "nano" in model_lower:
            return "GPT-5 Nano"
        return "GPT-5"
    if "gpt-4o" in model_lower:
        if "mini" in model_lower:
            return "GPT-4o Mini"
        return "GPT-4o"
    if "gpt-4" in model_lower:
        return f"GPT-4 ({model})"
    return model


def _log(feature: str, message: str, marker: str = ""):
    """Print log with feature name prefix."""
    feature_ja = FEATURE_NAMES.get(feature, feature)
    if marker:
        print(f"[{feature_ja}] {marker} {message}")
    else:
        print(f"[{feature_ja}] {message}")


def _resolve_openai_model(feature: str, model_hint: Optional[str] = None) -> str:
    """Resolve OpenAI model name based on feature and optional hint."""
    if model_hint and model_hint not in ("openai", "gpt-4o-mini", "gpt-5-mini", "gpt-5-nano"):
        return model_hint
    return settings.openai_model


@dataclass
class LLMError:
    """Detailed LLM error information."""
    error_type: str  # "no_api_key", "billing", "rate_limit", "invalid_key", "network", "parse", "unknown"
    message: str  # User-facing message in Japanese
    detail: str  # Technical detail for logging
    provider: str  # "anthropic" or "openai"
    feature: str  # Feature that was being used

    def to_dict(self) -> dict:
        return {
            "error_type": self.error_type,
            "message": self.message,
            "detail": self.detail,
            "provider": self.provider,
            "feature": self.feature,
        }


@dataclass
class LLMResult:
    """Result from LLM call."""
    success: bool
    data: dict | None = None
    error: LLMError | None = None


def _create_error(
    error_type: str,
    provider: str,
    feature: str,
    detail: str = ""
) -> LLMError:
    """Create a detailed error with user-friendly message."""
    feature_name = FEATURE_NAMES.get(feature, feature)
    provider_name = "Claude (Anthropic)" if provider == "anthropic" else "OpenAI"

    messages = {
        "no_api_key": f"APIキーが設定されていません。{provider_name}のAPIキーを.env.localファイルに設定してください。",
        "billing": f"{provider_name}のクレジット残高が不足しています。APIダッシュボードでクレジットを追加してください。",
        "rate_limit": f"{provider_name}のレート制限に達しました。しばらく待ってから再度お試しください。",
        "invalid_key": f"{provider_name}のAPIキーが無効です。正しいAPIキーを設定してください。",
        "network": f"{provider_name}への接続に失敗しました。ネットワーク接続を確認してください。",
        "parse": "AIからの応答を解析できませんでした。もう一度お試しください。",
        "unknown": f"{feature_name}の処理中にエラーが発生しました。しばらくしてから再度お試しください。",
    }

    return LLMError(
        error_type=error_type,
        message=messages.get(error_type, messages["unknown"]),
        detail=detail,
        provider=provider,
        feature=feature,
    )


def _classify_anthropic_error(error: Exception) -> tuple[str, str]:
    """Classify Anthropic API error and return (error_type, detail)."""
    error_str = str(error).lower()

    if "credit balance is too low" in error_str or "billing" in error_str:
        return "billing", "Anthropic credit balance is too low"
    elif "rate limit" in error_str or "429" in error_str:
        return "rate_limit", "Anthropic rate limit exceeded"
    elif "invalid api key" in error_str or "authentication" in error_str or "401" in error_str:
        return "invalid_key", "Anthropic API key is invalid"
    elif "connection" in error_str or "timeout" in error_str or "network" in error_str:
        return "network", f"Network error: {error}"
    else:
        return "unknown", str(error)


def _classify_openai_error(error: Exception) -> tuple[str, str]:
    """Classify OpenAI API error and return (error_type, detail)."""
    error_str = str(error).lower()

    if "insufficient_quota" in error_str or "exceeded your current quota" in error_str:
        return "billing", "OpenAI quota exceeded"
    elif "rate limit" in error_str or "429" in error_str:
        return "rate_limit", "OpenAI rate limit exceeded"
    elif "invalid api key" in error_str or "authentication" in error_str or "401" in error_str:
        return "invalid_key", "OpenAI API key is invalid"
    elif "connection" in error_str or "timeout" in error_str or "network" in error_str:
        return "network", f"Network error: {error}"
    else:
        return "unknown", str(error)


async def call_llm_with_error(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: LLMModel | None = None,
    feature: str | None = None,
    response_format: ResponseFormat = "json_object",
    json_schema: dict | None = None,
    use_responses_api: bool = False,
    retry_on_parse: bool = False,
    parse_retry_instructions: Optional[str] = None
) -> LLMResult:
    """
    Call LLM with automatic provider selection and detailed error handling.

    Args:
        system_prompt: System prompt for the LLM
        user_message: User message (used when messages is None)
        messages: Optional conversation history (for multi-turn conversations)
        max_tokens: Maximum tokens in response
        temperature: Sampling temperature
        model: Explicit model selection ("claude-sonnet" or OpenAI model name)
        feature: Feature name for automatic model selection

    Returns:
        LLMResult with success status, data, and optional error details
    """
    feature = feature or "unknown"

    # Model selection: explicit > feature config > default
    if model is None:
        model = MODEL_CONFIG.get(feature, "claude-sonnet")

    # Determine provider
    provider = "anthropic" if model in ("claude-sonnet", "claude-haiku") else "openai"

    # API key check with fallback
    if model in ("claude-sonnet", "claude-haiku") and not settings.anthropic_api_key:
        if settings.openai_api_key:
            _log(feature, "Anthropic APIキー未設定、OpenAIにフォールバック", WARNING)
            model = "openai"
            provider = "openai"
        else:
            error = _create_error(
                "no_api_key",
                "anthropic",
                feature,
                "ANTHROPIC_API_KEY and OPENAI_API_KEY are both missing"
            )
            _log(feature, "APIキーが設定されていません", ERROR)
            return LLMResult(success=False, error=error)

    if provider == "openai" and not settings.openai_api_key:
        if settings.anthropic_api_key:
            _log(feature, "OpenAI APIキー未設定、Claudeにフォールバック", WARNING)
            model = "claude-sonnet"
            provider = "anthropic"
        else:
            error = _create_error(
                "no_api_key",
                "openai",
                feature,
                "ANTHROPIC_API_KEY and OPENAI_API_KEY are both missing"
            )
            _log(feature, "APIキーが設定されていません", ERROR)
            return LLMResult(success=False, error=error)

    try:
        if model == "claude-sonnet":
            actual_model = settings.claude_model
        elif model == "claude-haiku":
            actual_model = settings.claude_haiku_model
        else:
            actual_model = _resolve_openai_model(feature, model_hint=model)

        model_display = get_model_display_name(actual_model)
        _log(feature, f"{model_display} を呼び出し中...")

        raw_response = None
        if model in ("claude-sonnet", "claude-haiku"):
            raw_response = await _call_claude_raw(
                system_prompt,
                user_message,
                messages,
                max_tokens,
                temperature,
                actual_model,
                feature=feature
            )
            result = _parse_json_response(raw_response)
        else:
            if use_responses_api:
                result = await _call_openai_responses(
                    system_prompt,
                    user_message,
                    messages,
                    max_tokens,
                    temperature,
                    actual_model,
                    response_format=response_format,
                    json_schema=json_schema,
                    feature=feature
                )
            else:
                result = await _call_openai(
                    system_prompt,
                    user_message,
                    messages,
                    max_tokens,
                    temperature,
                    actual_model,
                    response_format=response_format,
                    json_schema=json_schema,
                    feature=feature
                )

        if result is not None:
            _log(feature, f"{model_display} で成功", SUCCESS)
            return LLMResult(success=True, data=result)
        else:
            # Parse retry (same provider) with stricter JSON instructions
            if retry_on_parse and provider == "anthropic":
                retry_note = parse_retry_instructions or (
                    "必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
                    "文字列内の改行は\\nでエスケープしてください。"
                )
                retry_system_prompt = f"{system_prompt}\n\n# JSON出力の厳守\n{retry_note}"
                _log(feature, "JSON解析失敗、Claude再試行します", WARNING)
                try:
                    raw_retry = await _call_claude_raw(
                        retry_system_prompt,
                        user_message,
                        messages,
                        max_tokens,
                        temperature,
                        actual_model,
                        feature=feature
                    )
                    retry_result = _parse_json_response(raw_retry)
                    if retry_result is not None:
                        _log(feature, f"{model_display} でリトライ成功", SUCCESS)
                        return LLMResult(success=True, data=retry_result)

                    repair_source = raw_retry or raw_response or ""
                    if repair_source:
                        _log(feature, "JSON修復を実行", WARNING)
                        repair_prompt = (
                            "以下の出力を、構造は変えずに有効なJSONに修復してください。"
                            "JSON以外は出力しないでください。\n\n"
                            f"{repair_source}"
                        )
                        raw_repair = await _call_claude_raw(
                            system_prompt="あなたはJSON修復の専門家です。必ずJSONのみ出力してください。",
                            user_message=repair_prompt,
                            messages=None,
                            max_tokens=min(max_tokens, 2000),
                            temperature=0.2,
                            model=actual_model,
                            feature=feature
                        )
                        repair_result = _parse_json_response(raw_repair)
                        if repair_result is not None:
                            _log(feature, f"{model_display} でJSON修復成功", SUCCESS)
                            return LLMResult(success=True, data=repair_result)
                except Exception as retry_err:
                    _log(feature, f"リトライ失敗: {retry_err}", WARNING)

            if retry_on_parse and provider == "openai":
                retry_note = parse_retry_instructions or (
                    "必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
                    "文字列内の改行は\\nでエスケープしてください。"
                )
                retry_system_prompt = f"{system_prompt}\n\n# JSON出力の厳守\n{retry_note}"
                _log(feature, "JSON解析失敗、リトライします", WARNING)
                try:
                    if use_responses_api:
                        retry_result = await _call_openai_responses(
                            retry_system_prompt,
                            user_message,
                            messages,
                            max_tokens,
                            temperature,
                            actual_model,
                            response_format=response_format,
                            json_schema=json_schema,
                            feature=feature
                        )
                    else:
                        retry_result = await _call_openai(
                            retry_system_prompt,
                            user_message,
                            messages,
                            max_tokens,
                            temperature,
                            actual_model,
                            response_format=response_format,
                            json_schema=json_schema,
                            feature=feature
                        )
                    if retry_result is not None:
                        _log(feature, f"{model_display} でリトライ成功", SUCCESS)
                        return LLMResult(success=True, data=retry_result)
                except Exception as retry_err:
                    _log(feature, f"リトライ失敗: {retry_err}", WARNING)

            # パースエラー時のフォールバック
            fallback_provider = "anthropic" if provider == "openai" else "openai"
            fallback_api_key = settings.anthropic_api_key if fallback_provider == "anthropic" else settings.openai_api_key

            if fallback_api_key:
                fallback_name = "Claude" if fallback_provider == "anthropic" else "OpenAI"
                _log(feature, f"解析エラー、{fallback_name} にフォールバック", WARNING)
                try:
                    if fallback_provider == "anthropic":
                        fallback_result = await _call_claude(system_prompt, user_message, messages, max_tokens, temperature, feature=feature)
                    else:
                        fallback_model = _resolve_openai_model(feature, model_hint=settings.openai_model)
                        if use_responses_api:
                            fallback_result = await _call_openai_responses(
                                system_prompt, user_message, messages, max_tokens, temperature, fallback_model,
                                response_format=response_format, json_schema=json_schema, feature=feature
                            )
                        else:
                            fallback_result = await _call_openai(
                                system_prompt, user_message, messages, max_tokens, temperature, fallback_model,
                                response_format=response_format, json_schema=json_schema, feature=feature
                            )
                    if fallback_result is not None:
                        _log(feature, f"{fallback_name} へのフォールバック成功", SUCCESS)
                        return LLMResult(success=True, data=fallback_result)
                except Exception as fallback_err:
                    _log(feature, f"{fallback_name} フォールバック失敗: {fallback_err}", ERROR)

            error = _create_error("parse", provider, feature, "Empty or unparseable response")
            _log(feature, "応答の解析に失敗しました", ERROR)
            return LLMResult(success=False, error=error)

    except AnthropicAPIError as e:
        error_type, detail = _classify_anthropic_error(e)

        # Try OpenAI fallback for billing/rate_limit errors
        if error_type in ("billing", "rate_limit") and settings.openai_api_key and model == "claude-sonnet":
            error_msg = "クレジット不足" if error_type == "billing" else "レート制限"
            _log(feature, f"Anthropic {error_msg}、OpenAI にフォールバック", WARNING)
            try:
                fallback_model = _resolve_openai_model(feature, model_hint=settings.openai_model)
                if use_responses_api:
                    result = await _call_openai_responses(
                        system_prompt,
                        user_message,
                        messages,
                        max_tokens,
                        temperature,
                        fallback_model,
                        response_format=response_format,
                        json_schema=json_schema,
                        feature=feature
                    )
                else:
                    result = await _call_openai(
                        system_prompt,
                        user_message,
                        messages,
                        max_tokens,
                        temperature,
                        fallback_model,
                        response_format=response_format,
                        json_schema=json_schema,
                        feature=feature
                    )
                if result is not None:
                    _log(feature, "OpenAI へのフォールバック成功", SUCCESS)
                    return LLMResult(success=True, data=result)
            except Exception as fallback_err:
                _log(feature, f"OpenAI フォールバック失敗: {fallback_err}", ERROR)

        error = _create_error(error_type, "anthropic", feature, detail)
        _log(feature, f"Anthropic APIエラー: {detail}", ERROR)
        return LLMResult(success=False, error=error)

    except OpenAIAPIError as e:
        error_type, detail = _classify_openai_error(e)

        # Try Claude fallback for billing/rate_limit errors
        if error_type in ("billing", "rate_limit") and settings.anthropic_api_key and provider == "openai":
            error_msg = "クレジット不足" if error_type == "billing" else "レート制限"
            _log(feature, f"OpenAI {error_msg}、Claude にフォールバック", WARNING)
            try:
                result = await _call_claude(system_prompt, user_message, messages, max_tokens, temperature, feature=feature)
                if result is not None:
                    _log(feature, "Claude へのフォールバック成功", SUCCESS)
                    return LLMResult(success=True, data=result)
            except Exception as fallback_err:
                _log(feature, f"Claude フォールバック失敗: {fallback_err}", ERROR)

        error = _create_error(error_type, "openai", feature, detail)
        _log(feature, f"OpenAI APIエラー: {detail}", ERROR)
        return LLMResult(success=False, error=error)

    except Exception as e:
        # Try to classify generic errors
        if provider == "anthropic":
            error_type, detail = _classify_anthropic_error(e)

            # Try OpenAI fallback for billing/rate_limit errors
            if error_type in ("billing", "rate_limit") and settings.openai_api_key and model == "claude-sonnet":
                error_msg = "クレジット不足" if error_type == "billing" else "レート制限"
                _log(feature, f"Anthropic {error_msg}、OpenAI にフォールバック", WARNING)
                try:
                    fallback_model = _resolve_openai_model(feature, model_hint=settings.openai_model)
                    if use_responses_api:
                        result = await _call_openai_responses(
                            system_prompt,
                            user_message,
                            messages,
                            max_tokens,
                            temperature,
                            fallback_model,
                            response_format=response_format,
                            json_schema=json_schema,
                            feature=feature
                        )
                    else:
                        result = await _call_openai(
                            system_prompt,
                            user_message,
                            messages,
                            max_tokens,
                            temperature,
                            fallback_model,
                            response_format=response_format,
                            json_schema=json_schema,
                            feature=feature
                        )
                    if result is not None:
                        _log(feature, "OpenAI へのフォールバック成功", SUCCESS)
                        return LLMResult(success=True, data=result)
                except Exception as fallback_err:
                    _log(feature, f"OpenAI フォールバック失敗: {fallback_err}", ERROR)
        else:
            error_type, detail = _classify_openai_error(e)

            # Try Claude fallback for billing/rate_limit errors
            if error_type in ("billing", "rate_limit") and settings.anthropic_api_key and provider == "openai":
                error_msg = "クレジット不足" if error_type == "billing" else "レート制限"
                _log(feature, f"OpenAI {error_msg}、Claude にフォールバック", WARNING)
                try:
                    result = await _call_claude(system_prompt, user_message, messages, max_tokens, temperature, feature=feature)
                    if result is not None:
                        _log(feature, "Claude へのフォールバック成功", SUCCESS)
                        return LLMResult(success=True, data=result)
                except Exception as fallback_err:
                    _log(feature, f"Claude フォールバック失敗: {fallback_err}", ERROR)

        error = _create_error(error_type, provider, feature, detail)
        provider_name = "Anthropic" if provider == "anthropic" else "OpenAI"
        _log(feature, f"{provider_name} 予期しないエラー: {e}", ERROR)
        return LLMResult(success=False, error=error)


def _is_rag_feature(feature: str) -> bool:
    """Check if feature is RAG-related (uses shorter timeout)."""
    return feature in ("rag_query", "rag_rerank", "rag_classify")


async def _call_claude_raw(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str | None = None,
    feature: str = "unknown"
) -> str:
    """Call Claude API and return raw text."""
    client = get_anthropic_client(for_rag=_is_rag_feature(feature))

    if messages is None:
        messages = [{"role": "user", "content": user_message}]

    # Use provided model or default to claude_model (Sonnet)
    actual_model = model or settings.claude_model

    response = await client.messages.create(
        model=actual_model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=messages
    )

    if not response.content:
        print("[Claude] 空の応答を受信")
        return ""

    return response.content[0].text or ""


async def _call_claude(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str | None = None,
    feature: str = "unknown"
) -> dict | None:
    """Call Claude API and parse JSON response."""
    content = await _call_claude_raw(
        system_prompt=system_prompt,
        user_message=user_message,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
        feature=feature
    )
    if not content:
        return None
    return _parse_json_response(content)


async def _call_openai(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    response_format: ResponseFormat = "json_object",
    json_schema: dict | None = None,
    feature: str = "unknown"
) -> dict | None:
    """Call OpenAI Chat Completions API."""
    client = get_openai_client(for_rag=_is_rag_feature(feature))

    if messages is None:
        api_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
    else:
        api_messages = [{"role": "system", "content": system_prompt}] + messages

    response_format_payload = None
    if response_format == "json_schema" and json_schema:
        response_format_payload = {
            "type": "json_schema",
            "json_schema": json_schema
        }
    elif response_format == "json_object":
        response_format_payload = {"type": "json_object"}

    request_kwargs = {
        "model": model,
        "messages": api_messages,
    }
    if _openai_uses_max_completion_tokens(model):
        request_kwargs["max_completion_tokens"] = max_tokens
    else:
        request_kwargs["max_tokens"] = max_tokens
    if _openai_supports_temperature(model):
        request_kwargs["temperature"] = temperature
    if response_format_payload:
        request_kwargs["response_format"] = response_format_payload

    response = await client.chat.completions.create(**request_kwargs)

    content = response.choices[0].message.content
    if not content:
        print("[OpenAI] 空の応答を受信")
        return None
    return _parse_json_response(content)


async def _call_openai_responses(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    response_format: ResponseFormat = "json_schema",
    json_schema: dict | None = None,
    feature: str = "unknown"
) -> dict | None:
    """Call OpenAI Responses API with optional Structured Outputs."""
    client = get_openai_client(for_rag=_is_rag_feature(feature))

    if messages is None:
        input_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
    else:
        input_messages = [{"role": "system", "content": system_prompt}] + messages

    text_format = None
    if response_format == "json_schema" and json_schema:
        schema_name = json_schema.get("name", "response")
        schema_body = json_schema.get("schema", json_schema)
        text_format = {
            "type": "json_schema",
            "name": schema_name,
            "schema": schema_body,
            "strict": True
        }
    elif response_format == "text":
        text_format = {"type": "text"}

    request_kwargs = {
        "model": model,
        "input": input_messages,
        "max_output_tokens": max_tokens,
    }
    if _openai_supports_temperature(model):
        request_kwargs["temperature"] = temperature
    if text_format:
        request_kwargs["text"] = {"format": text_format}

    response = await client.responses.create(**request_kwargs)

    # 0. Try parsed output if available (Structured Outputs)
    parsed = getattr(response, "output_parsed", None)
    if isinstance(parsed, dict):
        return parsed

    try:
        # 1. Collect candidates from output items (prefer JSON payloads)
        candidates: list[object] = []
        output_items = getattr(response, "output", None) or []
        for output in output_items:
            content_items = getattr(output, "content", None)
            if content_items is None and isinstance(output, dict):
                content_items = output.get("content")
            if not content_items:
                continue

            for item in content_items:
                if isinstance(item, dict):
                    json_payload = item.get("json")
                    if json_payload is not None:
                        if isinstance(json_payload, dict):
                            return json_payload
                        if isinstance(json_payload, str):
                            candidates.append(json_payload)
                        elif callable(json_payload):
                            pass
                        else:
                            candidates.append(str(json_payload))
                    text_payload = item.get("text") or item.get("output_text")
                    if isinstance(text_payload, str) and text_payload:
                        candidates.append(text_payload)
                else:
                    json_payload = getattr(item, "json", None)
                    if json_payload is not None:
                        if isinstance(json_payload, dict):
                            return json_payload
                        if isinstance(json_payload, str):
                            candidates.append(json_payload)
                        elif callable(json_payload):
                            pass
                        else:
                            candidates.append(str(json_payload))
                    text_payload = getattr(item, "text", None) or getattr(item, "output_text", None)
                    if isinstance(text_payload, str) and text_payload:
                        candidates.append(text_payload)

        # 2. Fallback to aggregated output_text if present
        content = getattr(response, "output_text", None)
        if isinstance(content, str) and content.strip():
            candidates.append(content)

        for candidate in candidates:
            if isinstance(candidate, dict):
                return candidate
            if isinstance(candidate, str):
                parsed = _parse_json_response(candidate)
                if parsed is not None:
                    return parsed
    except Exception as e:
        print(f"[OpenAI] Responses API 抽出エラー: {e}")

    print("[OpenAI] Responses API から空の応答")
    return None


def _openai_supports_temperature(model: str) -> bool:
    """Return False for OpenAI models that reject temperature (e.g., GPT-5)."""
    model_lower = (model or "").lower()
    return not model_lower.startswith("gpt-5")


def _openai_uses_max_completion_tokens(model: str) -> bool:
    """Return True for OpenAI models that require max_completion_tokens (e.g., GPT-5)."""
    model_lower = (model or "").lower()
    return model_lower.startswith("gpt-5")


def _parse_json_response(content: str) -> dict | None:
    """Parse JSON response, handling various formats including markdown blocks."""
    import re

    if not content:
        print("[JSON解析] 空のコンテンツ")
        return None

    original_content = content

    def extract_first_balanced_object(raw: str) -> str | None:
        start = raw.find("{")
        if start == -1:
            return None
        in_string = False
        escape_next = False
        depth = 0
        for idx in range(start, len(raw)):
            ch = raw[idx]
            if escape_next:
                escape_next = False
                continue
            if ch == "\\":
                if in_string:
                    escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return raw[start:idx + 1]
        return None

    def repair_unbalanced_object(raw: str) -> str | None:
        stripped = raw.strip()
        if not stripped.startswith("{"):
            return None
        in_string = False
        escape_next = False
        depth = 0
        for ch in stripped:
            if escape_next:
                escape_next = False
                continue
            if ch == "\\":
                if in_string:
                    escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth = max(depth - 1, 0)
        if in_string:
            return None
        if depth <= 0:
            return stripped
        return stripped + ("}" * depth)

    def strip_trailing_commas(raw: str) -> str:
        return re.sub(r",\s*([}\]])", r"\1", raw)

    def sanitize_json_string(raw: str) -> str:
        """Escape unescaped newlines/tabs inside JSON string literals."""
        result = []
        in_string = False
        escape_next = False

        for ch in raw:
            if escape_next:
                result.append(ch)
                escape_next = False
                continue

            if ch == "\\":
                result.append(ch)
                escape_next = True
                continue

            if ch == '"':
                in_string = not in_string
                result.append(ch)
                continue

            if in_string:
                if ch == "\n":
                    result.append("\\n")
                    continue
                if ch == "\r":
                    result.append("\\r")
                    continue
                if ch == "\t":
                    result.append("\\t")
                    continue

            result.append(ch)

        return "".join(result)

    # 1. Try direct parse first
    try:
        return json.loads(content.strip())
    except json.JSONDecodeError:
        try:
            return json.loads(sanitize_json_string(content.strip()))
        except json.JSONDecodeError:
            pass

    # 2. Extract from ```json block (handles truncated responses without closing ```)
    if "```json" in content:
        try:
            parts = content.split("```json", 1)
            if len(parts) > 1:
                json_part = parts[1]
                # Check if closing ``` exists
                if "```" in json_part:
                    json_str = json_part.split("```")[0]
                else:
                    # Truncated response - use all remaining content
                    json_str = json_part
                try:
                    return json.loads(json_str.strip())
                except json.JSONDecodeError:
                    # Try sanitizing
                    try:
                        return json.loads(sanitize_json_string(json_str.strip()))
                    except json.JSONDecodeError:
                        # Try repairing unbalanced JSON from truncated block
                        repaired = repair_unbalanced_object(json_str.strip())
                        if repaired:
                            return json.loads(repaired)
        except (json.JSONDecodeError, IndexError):
            pass

    # 3. Extract from ``` block (generic code block, handles truncated responses)
    if "```" in content:
        try:
            parts = content.split("```", 1)
            if len(parts) > 1:
                json_part = parts[1]
                # Check if closing ``` exists
                if "```" in json_part:
                    json_str = json_part.split("```")[0]
                else:
                    # Truncated response - use all remaining content
                    json_str = json_part
                try:
                    return json.loads(json_str.strip())
                except json.JSONDecodeError:
                    # Try sanitizing
                    try:
                        return json.loads(sanitize_json_string(json_str.strip()))
                    except json.JSONDecodeError:
                        # Try repairing unbalanced JSON from truncated block
                        repaired = repair_unbalanced_object(json_str.strip())
                        if repaired:
                            return json.loads(repaired)
        except (json.JSONDecodeError, IndexError):
            pass

    # 4. Extract JSON object using regex (find outermost { ... })
    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        try:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                return json.loads(sanitize_json_string(json_match.group()))
        except json.JSONDecodeError:
            pass

    # 4.5 Extract first balanced JSON object
    balanced = extract_first_balanced_object(content)
    if balanced:
        candidate = strip_trailing_commas(balanced)
        try:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                return json.loads(sanitize_json_string(candidate))
        except json.JSONDecodeError:
            pass

    # 4.6 Repair unbalanced JSON object by closing braces
    repaired = repair_unbalanced_object(content)
    if repaired:
        candidate = strip_trailing_commas(repaired)
        try:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                return json.loads(sanitize_json_string(candidate))
        except json.JSONDecodeError:
            pass

    # 5. Parse failed - log for debugging
    preview = original_content[:200] if len(original_content) > 200 else original_content
    print(f"[JSON解析] ⚠️ 解析失敗（{len(original_content)}文字）: {preview[:100]}...")
    return None
