"""
LLM Utility Module

Provides a unified interface for calling different LLM providers:
- Claude Sonnet (primary for ES review, Gakuchika)
- OpenAI gpt-4o-mini (for company info extraction)

Supports automatic model selection based on feature, with fallback logic.
"""

from anthropic import AsyncAnthropic, APIError as AnthropicAPIError
import openai
from openai import APIError as OpenAIAPIError
from app.config import settings
import json
from typing import Literal
from dataclasses import dataclass


LLMModel = Literal["claude-sonnet", "gpt-4o-mini"]

# Feature-based model configuration
MODEL_CONFIG: dict[str, LLMModel] = {
    "es_review": "claude-sonnet",      # High-quality review and rewrite
    "gakuchika": "claude-sonnet",      # Interactive deep-dive questions
    "company_info": "gpt-4o-mini",     # Cost-effective structured extraction
}

# Feature name mapping for error messages
FEATURE_NAMES = {
    "es_review": "ES添削",
    "gakuchika": "ガクチカ深掘り",
    "company_info": "企業情報抽出",
}


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


async def call_llm(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: LLMModel | None = None,
    feature: str | None = None
) -> dict | None:
    """
    Call LLM with automatic provider selection.

    DEPRECATED: Use call_llm_with_error() for detailed error handling.

    Args:
        system_prompt: System prompt for the LLM
        user_message: User message (used when messages is None)
        messages: Optional conversation history (for multi-turn conversations)
        max_tokens: Maximum tokens in response
        temperature: Sampling temperature
        model: Explicit model selection ("claude-sonnet" or "gpt-4o-mini")
        feature: Feature name for automatic model selection ("es_review", "gakuchika", "company_info")

    Returns:
        Parsed JSON dict, or None on failure
    """
    result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
        feature=feature
    )

    if result.success:
        return result.data
    else:
        # Log error for backwards compatibility
        if result.error:
            print(f"[LLM] Error: {result.error.detail}")
        return None


async def call_llm_with_error(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: LLMModel | None = None,
    feature: str | None = None
) -> LLMResult:
    """
    Call LLM with automatic provider selection and detailed error handling.

    Args:
        system_prompt: System prompt for the LLM
        user_message: User message (used when messages is None)
        messages: Optional conversation history (for multi-turn conversations)
        max_tokens: Maximum tokens in response
        temperature: Sampling temperature
        model: Explicit model selection ("claude-sonnet" or "gpt-4o-mini")
        feature: Feature name for automatic model selection

    Returns:
        LLMResult with success status, data, and optional error details
    """
    feature = feature or "unknown"

    # Model selection: explicit > feature config > default
    if model is None:
        model = MODEL_CONFIG.get(feature, "claude-sonnet")

    # Determine provider
    provider = "anthropic" if model == "claude-sonnet" else "openai"

    # API key check with fallback
    if model == "claude-sonnet" and not settings.anthropic_api_key:
        if settings.openai_api_key:
            print(f"[LLM] ANTHROPIC_API_KEY not set, falling back to OpenAI for feature: {feature}")
            model = "gpt-4o-mini"
            provider = "openai"
        else:
            error = _create_error(
                "no_api_key",
                "anthropic",
                feature,
                "ANTHROPIC_API_KEY and OPENAI_API_KEY are both missing"
            )
            print(f"[LLM] {error.detail}")
            return LLMResult(success=False, error=error)

    if model == "gpt-4o-mini" and not settings.openai_api_key:
        if settings.anthropic_api_key:
            print(f"[LLM] OPENAI_API_KEY not set, falling back to Claude for feature: {feature}")
            model = "claude-sonnet"
            provider = "anthropic"
        else:
            error = _create_error(
                "no_api_key",
                "openai",
                feature,
                "ANTHROPIC_API_KEY and OPENAI_API_KEY are both missing"
            )
            print(f"[LLM] {error.detail}")
            return LLMResult(success=False, error=error)

    try:
        actual_model = settings.claude_model if model == "claude-sonnet" else settings.openai_model
        print(f"[LLM] Calling {model} ({actual_model}) for feature: {feature}")

        if model == "claude-sonnet":
            result = await _call_claude(system_prompt, user_message, messages, max_tokens, temperature)
        else:
            result = await _call_openai(system_prompt, user_message, messages, max_tokens, temperature)

        if result is not None:
            print(f"[LLM] Successfully received response from {model}")
            return LLMResult(success=True, data=result)
        else:
            error = _create_error("parse", provider, feature, "Empty or unparseable response")
            print(f"[LLM] {error.detail}")
            return LLMResult(success=False, error=error)

    except AnthropicAPIError as e:
        error_type, detail = _classify_anthropic_error(e)

        # Try OpenAI fallback for billing/rate_limit errors
        if error_type in ("billing", "rate_limit") and settings.openai_api_key and model == "claude-sonnet":
            print(f"[LLM] Anthropic {error_type}, falling back to OpenAI for feature: {feature}")
            try:
                result = await _call_openai(system_prompt, user_message, messages, max_tokens, temperature)
                if result is not None:
                    print(f"[LLM] OpenAI fallback succeeded for feature: {feature}")
                    return LLMResult(success=True, data=result)
            except Exception as fallback_err:
                print(f"[LLM] OpenAI fallback also failed: {fallback_err}")

        error = _create_error(error_type, "anthropic", feature, detail)
        print(f"[LLM] Anthropic API error: {detail}")
        return LLMResult(success=False, error=error)

    except OpenAIAPIError as e:
        error_type, detail = _classify_openai_error(e)
        error = _create_error(error_type, "openai", feature, detail)
        print(f"[LLM] OpenAI API error: {detail}")
        return LLMResult(success=False, error=error)

    except Exception as e:
        # Try to classify generic errors
        if provider == "anthropic":
            error_type, detail = _classify_anthropic_error(e)

            # Try OpenAI fallback for billing/rate_limit errors
            if error_type in ("billing", "rate_limit") and settings.openai_api_key and model == "claude-sonnet":
                print(f"[LLM] Anthropic {error_type} (generic), falling back to OpenAI for feature: {feature}")
                try:
                    result = await _call_openai(system_prompt, user_message, messages, max_tokens, temperature)
                    if result is not None:
                        print(f"[LLM] OpenAI fallback succeeded for feature: {feature}")
                        return LLMResult(success=True, data=result)
                except Exception as fallback_err:
                    print(f"[LLM] OpenAI fallback also failed: {fallback_err}")
        else:
            error_type, detail = _classify_openai_error(e)
        error = _create_error(error_type, provider, feature, detail)
        print(f"[LLM] Unexpected error ({provider}): {e}")
        return LLMResult(success=False, error=error)


async def _call_claude(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float
) -> dict | None:
    """Call Claude API."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    if messages is None:
        messages = [{"role": "user", "content": user_message}]

    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=messages
    )

    content = response.content[0].text
    return _parse_json_response(content)


async def _call_openai(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float
) -> dict | None:
    """Call OpenAI API."""
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    if messages is None:
        api_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
    else:
        api_messages = [{"role": "system", "content": system_prompt}] + messages

    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=api_messages,
        response_format={"type": "json_object"},
        max_tokens=max_tokens,
        temperature=temperature
    )

    content = response.choices[0].message.content
    return json.loads(content) if content else None


def _parse_json_response(content: str) -> dict | None:
    """Parse JSON response, handling ```json blocks."""
    try:
        # Extract from ```json block if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        return json.loads(content.strip())
    except json.JSONDecodeError as e:
        print(f"[LLM] JSON parse error: {e}")
        return None
