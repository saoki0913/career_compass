"""
LLMユーティリティモジュール

複数のLLMプロバイダーを統一的に呼び出すインターフェースを提供:
- Claude Sonnet（ES添削、ガクチカ深掘りのメイン）
- OpenAI（企業情報抽出、RAGユーティリティ用）

機能ごとの自動モデル選択とフォールバックロジックをサポート。
"""

import asyncio
from anthropic import AsyncAnthropic, APIError as AnthropicAPIError
import openai
from openai import APIError as OpenAIAPIError
from app.config import settings
import json
from typing import AsyncGenerator, Callable, Literal, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta

# Global clients for connection pooling
_anthropic_client: Optional[AsyncAnthropic] = None
_anthropic_client_rag: Optional[AsyncAnthropic] = None
_openai_client: Optional[openai.AsyncOpenAI] = None
_openai_client_rag: Optional[openai.AsyncOpenAI] = None

# Thread-safe lock for client initialization
_client_lock = asyncio.Lock()


@dataclass
class CircuitBreaker:
    """Circuit breaker to prevent cascading failures."""

    failures: int = 0
    last_failure: Optional[datetime] = None
    threshold: int = 3
    reset_timeout: timedelta = field(default_factory=lambda: timedelta(minutes=5))

    def is_open(self) -> bool:
        """Check if circuit is open (should skip this provider)."""
        if self.failures < self.threshold:
            return False
        if (
            self.last_failure
            and datetime.now() - self.last_failure > self.reset_timeout
        ):
            self.reset()
            return False
        return True

    def record_failure(self):
        """Record a failure."""
        self.failures += 1
        self.last_failure = datetime.now()

    def record_success(self):
        """Record a success - reset circuit."""
        self.reset()

    def reset(self):
        """Reset the circuit breaker."""
        self.failures = 0
        self.last_failure = None


# Circuit breakers for each provider
_anthropic_circuit = CircuitBreaker()
_openai_circuit = CircuitBreaker()


async def get_anthropic_client(for_rag: bool = False) -> AsyncAnthropic:
    """Anthropicクライアントを取得または作成（コネクションプーリング対応、スレッドセーフ）。"""
    global _anthropic_client, _anthropic_client_rag
    async with _client_lock:
        if for_rag:
            if _anthropic_client_rag is None:
                _anthropic_client_rag = AsyncAnthropic(
                    api_key=settings.anthropic_api_key,
                    timeout=settings.rag_timeout_seconds,
                )
            return _anthropic_client_rag
        else:
            if _anthropic_client is None:
                _anthropic_client = AsyncAnthropic(
                    api_key=settings.anthropic_api_key,
                    timeout=settings.llm_timeout_seconds,
                )
            return _anthropic_client


async def get_openai_client(for_rag: bool = False) -> openai.AsyncOpenAI:
    """OpenAIクライアントを取得または作成（コネクションプーリング対応、スレッドセーフ）。"""
    global _openai_client, _openai_client_rag
    async with _client_lock:
        if for_rag:
            if _openai_client_rag is None:
                _openai_client_rag = openai.AsyncOpenAI(
                    api_key=settings.openai_api_key,
                    timeout=settings.rag_timeout_seconds,
                )
            return _openai_client_rag
        else:
            if _openai_client is None:
                _openai_client = openai.AsyncOpenAI(
                    api_key=settings.openai_api_key,
                    timeout=settings.llm_timeout_seconds,
                )
            return _openai_client


LLMModel = Literal[
    "claude-sonnet", "claude-haiku", "openai", "gpt-4o-mini", "gpt-5-mini", "gpt-5-nano"
]
ResponseFormat = Literal["json_object", "json_schema", "text"]

# Feature-based model configuration (loaded from settings / .env.local)
def _build_model_config() -> dict[str, LLMModel]:
    """Build MODEL_CONFIG from environment-configurable settings."""
    return {
        "es_review": settings.model_es_review,
        "gakuchika": settings.model_gakuchika,
        "motivation": settings.model_motivation,
        "selection_schedule": settings.model_selection_schedule,
        "company_info": settings.model_company_info,
        "rag_query_expansion": settings.model_rag_query_expansion,
        "rag_hyde": settings.model_rag_hyde,
        "rag_rerank": settings.model_rag_rerank,
        "rag_classify": settings.model_rag_classify,
    }


# Lazy-initialized singleton
_model_config: dict[str, LLMModel] | None = None


def get_model_config() -> dict[str, LLMModel]:
    """Get MODEL_CONFIG (lazy-init on first access)."""
    global _model_config
    if _model_config is None:
        _model_config = _build_model_config()
    return _model_config

# Feature name mapping for error messages and logs
FEATURE_NAMES = {
    "es_review": "ES添削",
    "gakuchika": "ガクチカ深掘り",
    "motivation": "志望動機作成",
    "selection_schedule": "選考スケジュール抽出",
    "company_info": "企業情報抽出",
    "rag_query_expansion": "RAGクエリ拡張",
    "rag_hyde": "RAG仮想文書生成",
    "rag_rerank": "RAG再ランキング",
    "rag_classify": "RAGコンテンツ分類",
}

# Log markers
SUCCESS = "✅"
WARNING = "⚠️"
ERROR = "❌"
INFO = "ℹ️"


def get_model_display_name(model: str) -> str:
    """モデルIDを読みやすい表示名に変換。"""
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
    """機能名プレフィックス付きでログを出力。"""
    feature_ja = FEATURE_NAMES.get(feature, feature)
    if marker:
        print(f"[{feature_ja}] {marker} {message}")
    else:
        print(f"[{feature_ja}] {message}")


def _log_debug(feature: str, message: str) -> None:
    """Debugログ（settings.debug=Trueの時のみ出力）。"""
    if settings.debug:
        _log(feature, message, INFO)


def _resolve_openai_model(feature: str, model_hint: Optional[str] = None) -> str:
    """機能とオプションのヒントに基づいてOpenAIモデル名を解決。"""
    if model_hint and model_hint not in (
        "openai",
        "gpt-4o-mini",
        "gpt-5-mini",
        "gpt-5-nano",
    ):
        return model_hint
    return settings.openai_model


@dataclass
class LLMError:
    """LLMエラーの詳細情報。"""

    error_type: str  # "no_api_key", "billing", "rate_limit", "invalid_key", "network", "parse", "unknown"
    message: str  # ユーザー向けメッセージ（日本語）
    detail: str  # ログ用の技術的詳細
    provider: str  # "anthropic" または "openai"
    feature: str  # 使用中の機能

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
    """LLM呼び出しの結果。"""

    success: bool
    data: dict | None = None
    error: LLMError | None = None


def _create_error(
    error_type: str, provider: str, feature: str, detail: str = ""
) -> LLMError:
    """ユーザーフレンドリーなメッセージ付きの詳細エラーを作成。"""
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
    """Anthropic APIエラーを分類し、(error_type, detail)を返す。"""
    error_str = str(error).lower()

    if "credit balance is too low" in error_str or "billing" in error_str:
        return "billing", "Anthropicのクレジット残高が不足しています"
    elif "rate limit" in error_str or "429" in error_str:
        return "rate_limit", "Anthropicのレート制限を超えました"
    elif (
        "invalid api key" in error_str
        or "authentication" in error_str
        or "401" in error_str
    ):
        return "invalid_key", "AnthropicのAPIキーが無効です"
    elif "connection" in error_str or "timeout" in error_str or "network" in error_str:
        return "network", f"ネットワークエラー: {error}"
    else:
        return "unknown", str(error)


def _classify_openai_error(error: Exception) -> tuple[str, str]:
    """OpenAI APIエラーを分類し、(error_type, detail)を返す。"""
    error_str = str(error).lower()

    if "insufficient_quota" in error_str or "exceeded your current quota" in error_str:
        return "billing", "OpenAIのクォータを超えました"
    elif "rate limit" in error_str or "429" in error_str:
        return "rate_limit", "OpenAIのレート制限を超えました"
    elif (
        "invalid api key" in error_str
        or "authentication" in error_str
        or "401" in error_str
    ):
        return "invalid_key", "OpenAIのAPIキーが無効です"
    elif "connection" in error_str or "timeout" in error_str or "network" in error_str:
        return "network", f"ネットワークエラー: {error}"
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
    parse_retry_instructions: Optional[str] = None,
    disable_fallback: bool = False,
) -> LLMResult:
    """
    プロバイダー自動選択と詳細なエラーハンドリング付きでLLMを呼び出す。

    Args:
        system_prompt: LLMへのシステムプロンプト
        user_message: ユーザーメッセージ（messagesがNoneの場合に使用）
        messages: オプションの会話履歴（マルチターン会話用）
        max_tokens: レスポンスの最大トークン数
        temperature: サンプリング温度
        model: 明示的なモデル選択（"claude-sonnet"またはOpenAIモデル名）
        feature: 自動モデル選択用の機能名
        disable_fallback: Trueの場合、別プロバイダーへのフォールバックを無効化

    Returns:
        LLMResult: 成功ステータス、データ、オプションのエラー詳細を含む
    """
    feature = feature or "unknown"

    # モデル選択: 明示的指定 > 機能設定 > デフォルト
    if model is None:
        model = get_model_config().get(feature, "claude-sonnet")

    # プロバイダーを決定
    provider = "anthropic" if model in ("claude-sonnet", "claude-haiku") else "openai"

    # APIキーチェック（フォールバック付き）
    if model in ("claude-sonnet", "claude-haiku") and not settings.anthropic_api_key:
        if settings.openai_api_key and not disable_fallback:
            _log(feature, "Anthropic APIキー未設定、OpenAIにフォールバック", WARNING)
            model = "openai"
            provider = "openai"
        else:
            error = _create_error(
                "no_api_key",
                "anthropic",
                feature,
                "ANTHROPIC_API_KEYとOPENAI_API_KEYの両方が未設定です",
            )
            _log(feature, "APIキーが設定されていません", ERROR)
            return LLMResult(success=False, error=error)

    if provider == "openai" and not settings.openai_api_key:
        if settings.anthropic_api_key and not disable_fallback:
            _log(feature, "OpenAI APIキー未設定、Claudeにフォールバック", WARNING)
            model = "claude-sonnet"
            provider = "anthropic"
        else:
            error = _create_error(
                "no_api_key",
                "openai",
                feature,
                "ANTHROPIC_API_KEYとOPENAI_API_KEYの両方が未設定です",
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

        if messages is None:
            message_count = 1
            message_chars = len(user_message or "")
            message_mode = "user_message"
        else:
            message_count = len(messages)
            message_chars = sum(len(str(m.get("content", ""))) for m in messages)
            message_mode = "messages"

        _log_debug(
            feature,
            "LLM input size: "
            f"system={len(system_prompt)} chars, "
            f"{message_mode}={message_count} items/{message_chars} chars, "
            f"max_tokens={max_tokens}, temperature={temperature}, model={actual_model}",
        )

        raw_response = None
        if model in ("claude-sonnet", "claude-haiku"):
            raw_response = await _call_claude_raw(
                system_prompt,
                user_message,
                messages,
                max_tokens,
                temperature,
                actual_model,
                feature=feature,
            )
            if settings.debug:
                content = raw_response or ""
                open_braces = content.count("{") - content.count("}")
                open_brackets = content.count("[") - content.count("]")
                quote_count = content.count('"') - content.count('\\"')
                _log_debug(
                    feature,
                    "LLM raw response stats: "
                    f"chars={len(content)}, "
                    f"open_braces={open_braces}, "
                    f"open_brackets={open_brackets}, "
                    f"unescaped_quotes={quote_count}, "
                    f"truncation_suspected={_detect_truncation(content)}",
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
                    feature=feature,
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
                    feature=feature,
                )

        if result is not None:
            _log(feature, f"{model_display} で成功", SUCCESS)
            return LLMResult(success=True, data=result)
        else:
            # パース再試行（同一プロバイダー）- より厳格なJSON指示で
            if retry_on_parse and provider == "anthropic":
                retry_note = parse_retry_instructions or (
                    "必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
                    "文字列内の改行は\\nでエスケープしてください。"
                )
                retry_system_prompt = (
                    f"{system_prompt}\n\n# JSON出力の厳守\n{retry_note}"
                )
                _log(feature, "JSON解析失敗、Claude再試行します", WARNING)
                try:
                    raw_retry = await _call_claude_raw(
                        retry_system_prompt,
                        user_message,
                        messages,
                        max_tokens,
                        temperature,
                        actual_model,
                        feature=feature,
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
                        # JSON修復は常にSonnetを使用（Haikuでは複雑なJSON構造の修復が困難）
                        repair_model = settings.claude_model
                        if "haiku" in repair_model.lower():
                            repair_model = "claude-sonnet-4-5-20250929"
                        raw_repair = await _call_claude_raw(
                            system_prompt="あなたはJSON修復の専門家です。必ずJSONのみ出力してください。",
                            user_message=repair_prompt,
                            messages=None,
                            max_tokens=min(max_tokens, 2000),
                            temperature=0.1,  # より決定論的な出力のため低温度に設定
                            model=repair_model,
                            feature=feature,
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
                retry_system_prompt = (
                    f"{system_prompt}\n\n# JSON出力の厳守\n{retry_note}"
                )
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
                            feature=feature,
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
                            feature=feature,
                        )
                    if retry_result is not None:
                        _log(feature, f"{model_display} でリトライ成功", SUCCESS)
                        return LLMResult(success=True, data=retry_result)
                except Exception as retry_err:
                    _log(feature, f"リトライ失敗: {retry_err}", WARNING)

            # パースエラー時に別プロバイダーへフォールバック
            fallback_provider = "anthropic" if provider == "openai" else "openai"
            fallback_api_key = (
                settings.anthropic_api_key
                if fallback_provider == "anthropic"
                else settings.openai_api_key
            )

            if fallback_api_key and not disable_fallback:
                fallback_name = (
                    "Claude" if fallback_provider == "anthropic" else "OpenAI"
                )
                _log(feature, f"解析エラー、{fallback_name} にフォールバック", WARNING)
                try:
                    if fallback_provider == "anthropic":
                        fallback_result = await _call_claude(
                            system_prompt,
                            user_message,
                            messages,
                            max_tokens,
                            temperature,
                            feature=feature,
                        )
                    else:
                        fallback_model = _resolve_openai_model(
                            feature, model_hint=settings.openai_model
                        )
                        if use_responses_api:
                            fallback_result = await _call_openai_responses(
                                system_prompt,
                                user_message,
                                messages,
                                max_tokens,
                                temperature,
                                fallback_model,
                                response_format=response_format,
                                json_schema=json_schema,
                                feature=feature,
                            )
                            # Responses APIが空を返した場合、通常Chat APIにフォールバック
                            if fallback_result is None:
                                _log(feature, "Responses API空、Chat APIに再フォールバック", WARNING)
                                fallback_result = await _call_openai(
                                    system_prompt,
                                    user_message,
                                    messages,
                                    max_tokens,
                                    temperature,
                                    fallback_model,
                                    response_format="json",  # Chat APIはjsonモード
                                    json_schema=None,
                                    feature=feature,
                                )
                        else:
                            fallback_result = await _call_openai(
                                system_prompt,
                                user_message,
                                messages,
                                max_tokens,
                                temperature,
                                fallback_model,
                                response_format=response_format,
                                json_schema=json_schema,
                                feature=feature,
                            )
                    if fallback_result is not None:
                        _log(
                            feature, f"{fallback_name} へのフォールバック成功", SUCCESS
                        )
                        return LLMResult(success=True, data=fallback_result)
                except Exception as fallback_err:
                    _log(
                        feature,
                        f"{fallback_name} フォールバック失敗: {fallback_err}",
                        ERROR,
                    )

            error = _create_error(
                "parse", provider, feature, "空または解析不能なレスポンス"
            )
            _log(feature, "応答の解析に失敗しました", ERROR)
            return LLMResult(success=False, error=error)

    except AnthropicAPIError as e:
        error_type, detail = _classify_anthropic_error(e)

        # billing/rate_limitエラー時にOpenAIへフォールバック
        if (
            error_type in ("billing", "rate_limit")
            and settings.openai_api_key
            and model == "claude-sonnet"
            and not disable_fallback
        ):
            error_msg = "クレジット不足" if error_type == "billing" else "レート制限"
            _log(feature, f"Anthropic {error_msg}、OpenAI にフォールバック", WARNING)
            try:
                fallback_model = _resolve_openai_model(
                    feature, model_hint=settings.openai_model
                )
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
                        feature=feature,
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
                        feature=feature,
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

        # billing/rate_limitエラー時にClaudeへフォールバック
        if (
            error_type in ("billing", "rate_limit")
            and settings.anthropic_api_key
            and provider == "openai"
            and not disable_fallback
        ):
            error_msg = "クレジット不足" if error_type == "billing" else "レート制限"
            _log(feature, f"OpenAI {error_msg}、Claude にフォールバック", WARNING)
            try:
                result = await _call_claude(
                    system_prompt,
                    user_message,
                    messages,
                    max_tokens,
                    temperature,
                    feature=feature,
                )
                if result is not None:
                    _log(feature, "Claude へのフォールバック成功", SUCCESS)
                    return LLMResult(success=True, data=result)
            except Exception as fallback_err:
                _log(feature, f"Claude フォールバック失敗: {fallback_err}", ERROR)

        error = _create_error(error_type, "openai", feature, detail)
        _log(feature, f"OpenAI APIエラー: {detail}", ERROR)
        return LLMResult(success=False, error=error)

    except Exception as e:
        # 汎用エラーの分類を試行
        if provider == "anthropic":
            error_type, detail = _classify_anthropic_error(e)

            # billing/rate_limitエラー時にOpenAIへフォールバック
            if (
                error_type in ("billing", "rate_limit")
                and settings.openai_api_key
                and model == "claude-sonnet"
                and not disable_fallback
            ):
                error_msg = (
                    "クレジット不足" if error_type == "billing" else "レート制限"
                )
                _log(
                    feature, f"Anthropic {error_msg}、OpenAI にフォールバック", WARNING
                )
                try:
                    fallback_model = _resolve_openai_model(
                        feature, model_hint=settings.openai_model
                    )
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
                            feature=feature,
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
                            feature=feature,
                        )
                    if result is not None:
                        _log(feature, "OpenAI へのフォールバック成功", SUCCESS)
                        return LLMResult(success=True, data=result)
                except Exception as fallback_err:
                    _log(feature, f"OpenAI フォールバック失敗: {fallback_err}", ERROR)
        else:
            error_type, detail = _classify_openai_error(e)

            # billing/rate_limitエラー時にClaudeへフォールバック
            if (
                error_type in ("billing", "rate_limit")
                and settings.anthropic_api_key
                and provider == "openai"
                and not disable_fallback
            ):
                error_msg = (
                    "クレジット不足" if error_type == "billing" else "レート制限"
                )
                _log(feature, f"OpenAI {error_msg}、Claude にフォールバック", WARNING)
                try:
                    result = await _call_claude(
                        system_prompt,
                        user_message,
                        messages,
                        max_tokens,
                        temperature,
                        feature=feature,
                    )
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
    """機能がRAG関連かどうかを判定（短いタイムアウトを使用）。"""
    return feature in ("rag_query_expansion", "rag_hyde", "rag_rerank", "rag_classify")


async def _call_claude_raw(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str | None = None,
    feature: str = "unknown",
) -> str:
    """Claude APIを呼び出し、生のテキストを返す。"""
    client = await get_anthropic_client(for_rag=_is_rag_feature(feature))

    if messages is None:
        messages = [{"role": "user", "content": user_message}]

    # 指定されたモデルを使用、なければclaude_model（Sonnet）をデフォルトに
    actual_model = model or settings.claude_model

    response = await client.messages.create(
        model=actual_model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=messages,
    )

    if not response.content:
        print("[Claude] 空のレスポンスを受信")
        return ""

    return response.content[0].text or ""


async def _call_claude_raw_stream(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str | None = None,
    feature: str = "unknown",
) -> AsyncGenerator[str, None]:
    """Claude APIをストリーミングで呼び出し、テキストチャンクを逐次返す。"""
    client = await get_anthropic_client(for_rag=_is_rag_feature(feature))

    if messages is None:
        messages = [{"role": "user", "content": user_message}]

    actual_model = model or settings.claude_model

    async with client.messages.stream(
        model=actual_model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def call_llm_streaming(
    system_prompt: str,
    user_message: str,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: LLMModel | None = None,
    feature: str | None = None,
    on_chunk: Optional[Callable[[str, int], None]] = None,
) -> LLMResult:
    """
    ストリーミングでLLMを呼び出し、チャンクごとにon_chunkコールバックを実行。
    最終的にJSON解析して結果を返す。

    Args:
        on_chunk: コールバック(chunk_text, accumulated_length)
    """
    feature = feature or "unknown"

    if model is None:
        model = get_model_config().get(feature, "claude-sonnet")

    # Only Claude models support streaming in this implementation
    if model not in ("claude-sonnet", "claude-haiku"):
        # Fall back to non-streaming for non-Claude models
        return await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
            model=model,
            feature=feature,
        )

    if model == "claude-sonnet":
        actual_model = settings.claude_model
    else:
        actual_model = settings.claude_haiku_model

    model_display = get_model_display_name(actual_model)
    _log(feature, f"{model_display} をストリーミング呼び出し中...")

    try:
        accumulated = ""
        async for chunk in _call_claude_raw_stream(
            system_prompt=system_prompt,
            user_message=user_message,
            messages=None,
            max_tokens=max_tokens,
            temperature=temperature,
            model=actual_model,
            feature=feature,
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

        result = _parse_json_response(accumulated)
        if result is not None:
            _log(feature, f"{model_display} ストリーミング成功", SUCCESS)
            return LLMResult(success=True, data=result)

        # JSON parse failed - try repair via non-streaming call
        _log(feature, "ストリーミング応答のJSON解析失敗、修復を試行", WARNING)
        repair_prompt = f"""以下のテキストを有効なJSONに修復してください。JSON以外は出力しないでください。

{accumulated[:3000]}"""
        repair_result = await _call_claude(
            system_prompt="あなたはJSON修復の専門家です。必ずJSONのみ出力してください。",
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


async def _call_claude(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str | None = None,
    feature: str = "unknown",
) -> dict | None:
    """Claude APIを呼び出し、JSONレスポンスを解析して返す。"""
    content = await _call_claude_raw(
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
    feature: str = "unknown",
) -> dict | None:
    """OpenAI Chat Completions APIを呼び出す。"""
    client = await get_openai_client(for_rag=_is_rag_feature(feature))

    if messages is None:
        api_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
    else:
        api_messages = [{"role": "system", "content": system_prompt}] + messages

    response_format_payload = None
    if response_format == "json_schema" and json_schema:
        response_format_payload = {"type": "json_schema", "json_schema": json_schema}
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
        print("[OpenAI] 空のレスポンスを受信")
        return None
    if settings.debug:
        open_braces = content.count("{") - content.count("}")
        open_brackets = content.count("[") - content.count("]")
        quote_count = content.count('"') - content.count('\\"')
        _log_debug(
            feature,
            "OpenAI raw response stats: "
            f"chars={len(content)}, "
            f"open_braces={open_braces}, "
            f"open_brackets={open_brackets}, "
            f"unescaped_quotes={quote_count}, "
            f"truncation_suspected={_detect_truncation(content)}",
        )
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
    feature: str = "unknown",
) -> dict | None:
    """OpenAI Responses APIを呼び出す（オプションでStructured Outputs対応）。"""
    client = await get_openai_client(for_rag=_is_rag_feature(feature))

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
            "strict": True,
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

    if settings.debug:
        output_text = getattr(response, "output_text", None)
        output_text_len = len(output_text) if isinstance(output_text, str) else 0
        _log_debug(
            feature,
            f"OpenAI Responses API summary: output_text_len={output_text_len}",
        )

    # 0. 解析済み出力があれば使用（Structured Outputs）
    parsed = getattr(response, "output_parsed", None)
    if isinstance(parsed, dict):
        return parsed

    try:
        # 1. 出力アイテムから候補を収集（JSONペイロードを優先）
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
                    text_payload = getattr(item, "text", None) or getattr(
                        item, "output_text", None
                    )
                    if isinstance(text_payload, str) and text_payload:
                        candidates.append(text_payload)

        # 2. 集約されたoutput_textがあればフォールバック
        content = getattr(response, "output_text", None)
        if isinstance(content, str) and content.strip():
            candidates.append(content)

        if settings.debug:
            _log_debug(
                feature,
                f"OpenAI Responses API candidates: count={len(candidates)}",
            )

        for candidate in candidates:
            if isinstance(candidate, dict):
                return candidate
            if isinstance(candidate, str):
                parsed = _parse_json_response(candidate)
                if parsed is not None:
                    return parsed
    except Exception as e:
        print(f"[OpenAI] Responses API抽出エラー: {e}")

    # デバッグ: 候補の状態をログ出力
    if candidates:
        print(f"[OpenAI] 空のレスポンス (候補数: {len(candidates)})")
        for i, c in enumerate(candidates[:2]):  # 最初の2件のみ
            preview = str(c)[:200] if c else "(empty)"
            print(f"[OpenAI] 候補{i+1}プレビュー: {preview}...")
    else:
        output_text = getattr(response, "output_text", None) if response else None
        print(f"[OpenAI] Responses APIから空のレスポンス (output_text: {str(output_text)[:100] if output_text else 'None'})")
    return None


def _openai_supports_temperature(model: str) -> bool:
    """temperature設定を拒否するOpenAIモデル（例: GPT-5）の場合はFalseを返す。"""
    model_lower = (model or "").lower()
    return not model_lower.startswith("gpt-5")


def _openai_uses_max_completion_tokens(model: str) -> bool:
    """max_completion_tokensを必要とするOpenAIモデル（例: GPT-5）の場合はTrueを返す。"""
    model_lower = (model or "").lower()
    return model_lower.startswith("gpt-5")


def _detect_truncation(content: str) -> bool:
    """レスポンスが切り詰められた可能性を検出。"""
    if not content:
        return False

    stripped = content.rstrip()

    # 1. 明示的な切り詰め記号をチェック
    truncation_indicators = ("...", "…", "...")
    if stripped.endswith(truncation_indicators):
        return True

    # 2. 閉じ括弧の不足をチェック
    open_braces = content.count("{") - content.count("}")
    open_brackets = content.count("[") - content.count("]")
    if open_braces > 0 or open_brackets > 0:
        return True

    # 3. 長いレスポンスで文字列途中で終わっている（引用符が奇数）
    quote_count = content.count('"') - content.count('\\"')
    if quote_count % 2 != 0:
        return True

    return False


def _parse_json_response(content: str) -> dict | None:
    """JSONレスポンスを解析（マークダウンブロックなど様々な形式に対応）。"""
    import re

    if not content:
        print("[JSON解析] 空のコンテンツ")
        return None

    original_content = content

    # トランケーション検出
    if _detect_truncation(content):
        open_braces = content.count("{") - content.count("}")
        print(
            f"[JSON解析] ⚠️ 切り詰められたレスポンスの可能性 (未閉じブレース: {open_braces}, 長さ: {len(content)}文字)"
        )

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
                    return raw[start : idx + 1]
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
        """JSON文字列リテラル内のエスケープされていない改行/タブをエスケープ。"""
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

    # 1. まず直接解析を試行
    try:
        return json.loads(content.strip())
    except json.JSONDecodeError:
        try:
            return json.loads(sanitize_json_string(content.strip()))
        except json.JSONDecodeError:
            pass

    # 2. ```jsonブロックから抽出（閉じ```がない切り詰められたレスポンスも対応）
    if "```json" in content:
        try:
            parts = content.split("```json", 1)
            if len(parts) > 1:
                json_part = parts[1]
                # 閉じ```が存在するかチェック
                if "```" in json_part:
                    json_str = json_part.split("```")[0]
                else:
                    # 切り詰められたレスポンス - 残りのコンテンツを全て使用
                    json_str = json_part
                try:
                    return json.loads(json_str.strip())
                except json.JSONDecodeError:
                    # サニタイズを試行
                    try:
                        return json.loads(sanitize_json_string(json_str.strip()))
                    except json.JSONDecodeError:
                        # 切り詰められたブロックから不均衡なJSONを修復
                        repaired = repair_unbalanced_object(json_str.strip())
                        if repaired:
                            return json.loads(repaired)
        except (json.JSONDecodeError, IndexError):
            pass

    # 3. ```ブロックから抽出（汎用コードブロック、切り詰められたレスポンスも対応）
    if "```" in content:
        try:
            parts = content.split("```", 1)
            if len(parts) > 1:
                json_part = parts[1]
                # 閉じ```が存在するかチェック
                if "```" in json_part:
                    json_str = json_part.split("```")[0]
                else:
                    # 切り詰められたレスポンス - 残りのコンテンツを全て使用
                    json_str = json_part
                try:
                    return json.loads(json_str.strip())
                except json.JSONDecodeError:
                    # サニタイズを試行
                    try:
                        return json.loads(sanitize_json_string(json_str.strip()))
                    except json.JSONDecodeError:
                        # 切り詰められたブロックから不均衡なJSONを修復
                        repaired = repair_unbalanced_object(json_str.strip())
                        if repaired:
                            return json.loads(repaired)
        except (json.JSONDecodeError, IndexError):
            pass

    # 4. 正規表現でJSONオブジェクトを抽出（最も外側の { ... } を検索）
    json_match = re.search(r"\{[\s\S]*\}", content)
    if json_match:
        try:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                return json.loads(sanitize_json_string(json_match.group()))
        except json.JSONDecodeError:
            pass

    # 4.5 最初のバランスの取れたJSONオブジェクトを抽出
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

    # 4.6 不均衡なJSONオブジェクトを閉じ括弧で修復
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

    # 5. 解析失敗 - デバッグ用にログ出力
    preview = (
        original_content[:200] if len(original_content) > 200 else original_content
    )
    print(f"[JSON解析] ⚠️ 解析失敗（{len(original_content)}文字）: {preview[:100]}...")
    return None
