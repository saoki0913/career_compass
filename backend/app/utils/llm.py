"""
LLMユーティリティモジュール

複数のLLMプロバイダーを統一的に呼び出すインターフェースを提供:
- Claude Sonnet（ES添削、ガクチカ深掘りのメイン）
- OpenAI（企業情報抽出、RAGユーティリティ用）
- Google Gemini（公式 Gemini API）
- Cohere（OpenAI compatibility API）

機能ごとの自動モデル選択とフォールバックロジックをサポート。
"""

import asyncio
import base64
import httpx
import re as _re
from anthropic import AsyncAnthropic, APIError as AnthropicAPIError
import openai
from openai import APIError as OpenAIAPIError
from app.config import settings
import json
from typing import Any, AsyncGenerator, Callable, Literal, Optional, TypeAlias
from dataclasses import dataclass, field
from datetime import datetime, timedelta


def sanitize_prompt_input(text: str, max_length: int = 5000) -> str:
    """Sanitize user input before embedding in LLM prompts.

    Mitigates prompt injection by:
    - Truncating to max_length
    - Removing markdown heading markers that could override prompt structure
    - Removing triple backticks (code block injection)
    """
    if not text:
        return ""
    text = text[:max_length]
    # Remove markdown heading markers that could override prompt structure
    text = _re.sub(r"^#{1,6}\s", "", text, flags=_re.MULTILINE)
    # Remove triple backticks (code block injection)
    text = text.replace("```", "")
    return text


def sanitize_es_content(text: str, max_length: int = 5000) -> str:
    """Sanitize ES content before LLM processing.

    Extends sanitize_prompt_input with additional security measures:
    - Unicode control character removal (keeps \\n, \\r, \\t, space)
    - Role injection pattern removal (system:, assistant:, human:, user: at start of lines)
    - XML-like tag removal (<system>, <instructions>, </system>, etc.)
    - Default max_length=5000

    Args:
        text: The ES content to sanitize
        max_length: Maximum allowed length (default: 5000)

    Returns:
        Sanitized text safe for LLM processing
    """
    if not text:
        return ""

    # First apply basic sanitization
    text = sanitize_prompt_input(text, max_length)

    # Remove Unicode control characters (keep \n, \r, \t, space)
    # Control characters are in ranges: U+0000-U+001F (except \t\n\r) and U+007F-U+009F
    allowed_controls = {'\n', '\r', '\t', ' '}
    text = ''.join(
        char if char in allowed_controls or not (ord(char) < 32 or 127 <= ord(char) < 160)
        else ''
        for char in text
    )

    # Remove role injection patterns at start of lines
    # Patterns: "system:", "assistant:", "human:", "user:" (case-insensitive)
    text = _re.sub(
        r"^\s*(system|assistant|human|user)\s*:\s*",
        "",
        text,
        flags=_re.MULTILINE | _re.IGNORECASE
    )

    # Remove XML-like tags that could be used for instruction injection
    # Matches: <system>, </system>, <instructions>, <prompt>, etc.
    xml_tag_pattern = r"<\s*/?\s*(system|assistant|human|user|instructions|instruction|prompt|context|role)\s*>"
    text = _re.sub(xml_tag_pattern, "", text, flags=_re.IGNORECASE)

    return text


def detect_es_injection_risk(text: str) -> tuple[str, list[str]]:
    """Classify prompt-injection-like patterns in ES input.

    Returns:
        tuple[risk_level, reasons]
        risk_level: "none" | "medium" | "high"
    """
    if not text:
        return "none", []

    normalized = text.lower()
    reasons: list[str] = []
    risk = "none"
    
    def _matches(patterns: list[str], haystack: str = text) -> bool:
        return any(
            _re.search(pattern, haystack, flags=_re.IGNORECASE | _re.MULTILINE)
            for pattern in patterns
        )

    high_patterns = [
        (r"ignore\s+(all|any|previous|above)\s+instructions", "英語で無視命令"),
        (r"(system|developer)\s+prompt", "システム/開発者プロンプト要求"),
        (r"(reveal|show|print).*(prompt|instruction|secret|api key|token)", "内部情報の開示要求"),
        (r"これまでの指示を無視", "日本語の無視命令"),
        (r"(システム|開発者).*(プロンプト|指示)", "内部プロンプトへの言及"),
        (r"(内部|機密).*(表示|開示|出力)", "内部情報の開示要求"),
    ]
    medium_patterns = [
        (r"```", "コードブロック記法"),
        (r"<\s*/?\s*(system|assistant|user|prompt|instructions?)\s*>", "XML風タグ"),
        (r"^\s*(system|assistant|user|human)\s*:", "ロール接頭辞"),
        (r"(step by step|chain of thought|cot)", "推論開示要求"),
        (r"(前の命令|上記の指示).*(従わず|無視)", "命令上書きの試行"),
    ]

    for pattern, reason in high_patterns:
        if _re.search(pattern, normalized, flags=_re.IGNORECASE | _re.MULTILINE):
            reasons.append(reason)

    reveal_verbs = [
        r"(reveal|show|print|dump|display|extract|exfiltrate|leak)",
        r"(表示|見せ|開示|出力|抜き出|取得|抽出|漏えい|教えて)",
    ]
    reference_targets = [
        r"(reference\s*es|参考\s*es|参考文章|例文|模範解答|通過es)",
    ]
    prompt_targets = [
        r"(prompt|instruction|secret|api key|token|password|credential)",
        r"(プロンプト|指示|機密|秘密|apiキー|トークン|認証情報|ログイン情報)",
    ]
    pii_targets = [
        r"(個人情報|氏名|名前|メールアドレス|email|住所|電話番号|phone number|password|パスワード|ログインid|login id)",
    ]
    sql_patterns = [
        r"\bselect\b",
        r"\bunion\b",
        r"\binformation_schema\b",
        r"\bsqlite_master\b",
        r"\bpg_[a-z_]+\b",
        r"\bfrom\b",
        r"\bwhere\b",
    ]
    execution_targets = [
        r"(function call|tool call|use tool|open.*browser|run.*terminal|run.*psql|run.*sql|use.*database|use.*shell|use.*cli)",
        r"((ツール|ブラウザ|ターミナル|端末|データベース|sql\s*editor|シェル|コマンド).*(使って|実行して|叩いて|開いて)|psqlを実行)",
    ]

    if _matches(reference_targets) and _matches(reveal_verbs):
        reasons.append("参考ESの開示要求")
    if _matches(prompt_targets) and _matches(reveal_verbs):
        reasons.append("内部情報の開示要求")
    if _matches(execution_targets):
        reasons.append("外部機能の実行誘導")
    if _matches(sql_patterns) and (_matches(reveal_verbs) or _matches(pii_targets) or _matches([r"\busers?\b", r"会員", r"応募者"])):
        reasons.append("SQLによる情報抽出要求")
    if _matches(pii_targets) and (_matches(reveal_verbs) or _matches(sql_patterns)):
        reasons.append("個人情報の抽出要求")

    if reasons:
        return "high", reasons

    for pattern, reason in medium_patterns:
        if _re.search(pattern, text, flags=_re.IGNORECASE | _re.MULTILINE):
            reasons.append(reason)

    if reasons:
        risk = "medium"

    return risk, reasons

# Global clients for connection pooling
_anthropic_client: Optional[AsyncAnthropic] = None
_anthropic_client_rag: Optional[AsyncAnthropic] = None
_openai_client: Optional[openai.AsyncOpenAI] = None
_openai_client_rag: Optional[openai.AsyncOpenAI] = None
_compat_clients: dict[tuple[str, bool], openai.AsyncOpenAI] = {}
_google_http_client: Optional[httpx.AsyncClient] = None
_google_http_client_rag: Optional[httpx.AsyncClient] = None

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


LLMProvider = Literal["anthropic", "openai", "google", "cohere"]
LLMModel: TypeAlias = str
ResponseFormat = Literal["json_object", "json_schema", "text"]


@dataclass(frozen=True)
class ResolvedModelTarget:
    provider: LLMProvider
    actual_model: str


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


async def get_openai_compatible_client(
    provider: Literal["cohere"],
    *,
    for_rag: bool = False,
) -> openai.AsyncOpenAI:
    """OpenAI互換APIクライアントを取得する。"""
    global _compat_clients

    config = {
        "cohere": {
            "api_key": settings.cohere_api_key,
            "base_url": settings.cohere_base_url,
        },
    }[provider]

    timeout = settings.rag_timeout_seconds if for_rag else settings.llm_timeout_seconds
    cache_key = (provider, for_rag)

    async with _client_lock:
        client = _compat_clients.get(cache_key)
        if client is None:
            _compat_clients[cache_key] = openai.AsyncOpenAI(
                api_key=config["api_key"],
                base_url=config["base_url"],
                timeout=timeout,
            )
        return _compat_clients[cache_key]


async def get_google_http_client(for_rag: bool = False) -> httpx.AsyncClient:
    """Gemini API用 HTTP クライアントを取得する。"""
    global _google_http_client, _google_http_client_rag
    timeout = settings.rag_timeout_seconds if for_rag else settings.llm_timeout_seconds

    async with _client_lock:
        if for_rag:
            if _google_http_client_rag is None:
                _google_http_client_rag = httpx.AsyncClient(timeout=timeout)
            return _google_http_client_rag

        if _google_http_client is None:
            _google_http_client = httpx.AsyncClient(timeout=timeout)
        return _google_http_client

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
_DEBUG_ONLY_FEATURES = {
    "rag_query_expansion",
    "rag_hyde",
    "rag_rerank",
    "rag_classify",
}


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
    if model_lower.startswith("gemini-3.1-pro-preview"):
        return "Gemini 3.1 Pro Preview"
    if model_lower.startswith("gemini"):
        return f"Gemini ({model})"
    if model_lower.startswith("command-a"):
        return "Cohere Command A"
    if "gpt-5" in model_lower:
        if model_lower.startswith("gpt-5.2"):
            return "GPT-5.2"
        if model_lower.startswith("gpt-5.1"):
            return "GPT-5.1"
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
    if feature in _DEBUG_ONLY_FEATURES and marker not in {WARNING, ERROR}:
        return

    feature_ja = FEATURE_NAMES.get(feature, feature)
    if marker:
        print(f"[{feature_ja}] {marker} {message}")
    else:
        print(f"[{feature_ja}] {message}")


def _log_debug(feature: str, message: str) -> None:
    """Debugログ（settings.debug=Trueの時のみ出力）。"""
    if settings.debug:
        _log(feature, message, INFO)


def _provider_display_name(provider: str) -> str:
    return {
        "anthropic": "Claude (Anthropic)",
        "openai": "OpenAI",
        "google": "Google Gemini",
        "cohere": "Cohere",
        "qwen-es-review": "Qwen ES Review",
    }.get(provider, provider)


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


def _resolve_model_target(
    feature: str,
    model_hint: Optional[LLMModel] = None,
) -> ResolvedModelTarget:
    """機能設定または明示モデルIDから呼び出し先 provider / model を解決する。"""
    requested_model = model_hint or get_model_config().get(feature, "claude-sonnet")
    model_lower = str(requested_model or "").strip().lower()

    if requested_model == "claude-sonnet":
        return ResolvedModelTarget("anthropic", settings.claude_model)
    if requested_model == "claude-haiku":
        return ResolvedModelTarget("anthropic", settings.claude_haiku_model)
    if requested_model == "openai":
        return ResolvedModelTarget("openai", settings.openai_model)
    if requested_model == "google":
        return ResolvedModelTarget("google", settings.google_model)
    if requested_model == "cohere":
        return ResolvedModelTarget("cohere", settings.cohere_model)
    if model_lower.startswith("claude"):
        return ResolvedModelTarget("anthropic", str(requested_model))
    if model_lower.startswith("gemini"):
        return ResolvedModelTarget("google", str(requested_model))
    if model_lower.startswith("command-"):
        return ResolvedModelTarget("cohere", str(requested_model))

    resolved_openai_model = _resolve_openai_model(feature, model_hint=str(requested_model))
    return ResolvedModelTarget("openai", resolved_openai_model)


def resolve_feature_model_metadata(
    feature: str, requested_model: LLMModel | None = None
) -> tuple[str, str]:
    """現在の feature 設定から provider と model 名を返す。"""
    target = _resolve_model_target(feature, requested_model)
    provider = "claude" if target.provider == "anthropic" else target.provider
    return provider, target.actual_model


def _provider_has_api_key(provider: LLMProvider) -> bool:
    return {
        "anthropic": bool(settings.anthropic_api_key),
        "openai": bool(settings.openai_api_key),
        "google": bool(settings.google_api_key),
        "cohere": bool(settings.cohere_api_key),
    }[provider]


def _fallback_model_for_provider(provider: LLMProvider) -> Optional[LLMModel]:
    """失敗時に使う次善モデルを返す。"""
    if provider == "anthropic":
        if settings.openai_api_key:
            return "openai"
        return None

    if settings.anthropic_api_key:
        return "claude-sonnet"
    if provider != "openai" and settings.openai_api_key:
        return "openai"
    return None


def _requires_json_prompt_hint(provider: LLMProvider) -> bool:
    return provider in {"cohere", "google"}


def _schema_body(json_schema: dict | None) -> dict | None:
    if not json_schema:
        return None
    return json_schema.get("schema", json_schema)


def _build_google_response_schema(json_schema: dict | None) -> dict | None:
    schema_body = _schema_body(json_schema)
    if not isinstance(schema_body, dict):
        return None

    allowed_keys = {
        "type",
        "format",
        "description",
        "nullable",
        "enum",
        "items",
        "properties",
        "required",
        "propertyOrdering",
        "minItems",
        "maxItems",
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "anyOf",
    }

    def _clean(node: Any) -> Any:
        if isinstance(node, dict):
            cleaned: dict[str, Any] = {}
            for key, value in node.items():
                if key not in allowed_keys:
                    continue
                if key == "properties" and isinstance(value, dict):
                    cleaned[key] = {prop: _clean(prop_schema) for prop, prop_schema in value.items()}
                elif key == "items":
                    cleaned[key] = _clean(value)
                elif key == "anyOf" and isinstance(value, list):
                    cleaned[key] = [_clean(item) for item in value]
                else:
                    cleaned[key] = value
            return cleaned
        if isinstance(node, list):
            return [_clean(item) for item in node]
        return node

    return _clean(schema_body)


def _build_schema_example(schema: dict | None) -> Any:
    if not isinstance(schema, dict):
        return {}

    schema_type = schema.get("type")
    if schema_type == "object":
        properties = schema.get("properties") or {}
        return {
            key: _build_schema_example(value if isinstance(value, dict) else {})
            for key, value in properties.items()
        }
    if schema_type == "array":
        item_schema = schema.get("items")
        return [_build_schema_example(item_schema if isinstance(item_schema, dict) else {})]
    if schema_type == "number":
        return 0
    if schema_type == "integer":
        return 0
    if schema_type == "boolean":
        return False
    return ""


def _augment_system_prompt_for_provider_json(
    provider: LLMProvider,
    system_prompt: str,
    response_format: ResponseFormat,
    json_schema: dict | None,
) -> str:
    if response_format == "text" or not _requires_json_prompt_hint(provider):
        return system_prompt

    schema_body = _schema_body(json_schema)
    schema_example = _build_schema_example(schema_body)
    strict_note = (
        "\n\n# JSON出力の厳守\n"
        "必ず有効なJSONのみを返してください。説明文、前置き、コードブロックは禁止です。"
        "\n先頭文字は {、末尾文字は } にしてください。"
        "\n期待するJSONの骨組み:\n"
        f"{json.dumps(schema_example, ensure_ascii=False)}"
    )
    if provider == "google":
        strict_note += (
            "\nこれは単純な構造化出力タスクです。思考や解説を書かず、"
            "回答のJSONオブジェクトを先に、かつそれだけを返してください。"
        )
    return f"{system_prompt}{strict_note}"


def _augment_system_prompt_for_provider_text(
    provider: LLMProvider,
    system_prompt: str,
    *,
    feature: str,
) -> str:
    if feature != "es_review" or provider == "anthropic":
        return system_prompt

    strict_note = (
        "\n\n# 出力形式の厳守\n"
        "出力は最終本文のみを返してください。"
        "\n説明、前置き、後書き、見出し、箇条書き、コードブロック、引用符は禁止です。"
        "\n先頭から本文を書き始め、余計なラベルを付けないでください。"
    )
    if provider == "google":
        strict_note += "\n思考や解説は書かず、本文だけを返してください。"
    return f"{system_prompt}{strict_note}"


def _build_chat_response_format(
    provider: Literal["openai", "cohere"],
    response_format: ResponseFormat,
    json_schema: dict | None,
) -> dict[str, Any] | None:
    if response_format == "text":
        return None

    if response_format == "json_schema" and json_schema:
        schema_body = _schema_body(json_schema)
        if provider == "cohere":
            return {
                "type": "json_object",
                "schema": schema_body,
            }
        schema_name = str(json_schema.get("name") or "response")
        return {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "schema": schema_body,
                "strict": True,
            },
        }

    return {"type": "json_object"}


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
    raw_text: str | None = None  # Raw LLM response before JSON parsing


def _create_error(
    error_type: str, provider: str, feature: str, detail: str = ""
) -> LLMError:
    """ユーザーフレンドリーなメッセージ付きの詳細エラーを作成。"""
    feature_name = FEATURE_NAMES.get(feature, feature)
    provider_name = _provider_display_name(provider)

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


def _classify_google_error(error: Exception) -> tuple[str, str]:
    """Gemini APIエラーを分類し、(error_type, detail)を返す。"""
    if isinstance(error, httpx.HTTPStatusError):
        status_code = error.response.status_code
        if status_code == 429:
            return "rate_limit", f"Gemini APIのレート制限を超えました (status={status_code})"
        if status_code in {401, 403}:
            return "invalid_key", f"Gemini APIキーが無効、または権限が不足しています (status={status_code})"
        if status_code == 402:
            return "billing", "Gemini APIのクレジット残高が不足しています"
        if 400 <= status_code < 500:
            return "unknown", f"Gemini APIリクエストエラー (status={status_code})"
        return "network", f"Gemini API HTTPエラー (status={status_code})"
    if isinstance(error, httpx.TimeoutException):
        return "network", f"Gemini APIタイムアウト: {error}"
    if isinstance(error, httpx.HTTPError):
        return "network", f"Gemini API接続エラー: {error}"
    return "unknown", str(error)


def _classify_error_for_provider(provider: LLMProvider, error: Exception) -> tuple[str, str]:
    if provider == "anthropic":
        return _classify_anthropic_error(error)
    if provider == "google":
        return _classify_google_error(error)
    return _classify_openai_error(error)


def _build_gemini_contents(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = []
    for message in messages:
        role = str(message.get("role") or "user")
        text = str(message.get("content") or "")
        if not text:
            continue
        contents.append(
            {
                "role": "model" if role == "assistant" else "user",
                "parts": [{"text": text}],
            }
        )
    return contents


def _extract_gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    text_parts: list[str] = []
    for candidate in candidates:
        content = candidate.get("content") or {}
        parts = content.get("parts") or []
        for part in parts:
            if not isinstance(part, dict):
                continue
            part_text = str(part.get("text") or "").strip()
            if part_text:
                text_parts.append(part_text)
        candidate_text = str(candidate.get("text") or "").strip()
        if candidate_text:
            text_parts.append(candidate_text)
    top_level_text = str(payload.get("text") or "").strip()
    if top_level_text:
        text_parts.append(top_level_text)
    return "\n".join(part for part in text_parts if part)


def _build_google_generation_config(
    *,
    model: str,
    max_tokens: int,
    temperature: float,
) -> dict[str, Any]:
    model_lower = (model or "").lower()
    effective_max_tokens = max_tokens
    if model_lower.startswith("gemini-3"):
        effective_max_tokens = min(4096, max(max_tokens * 4, max_tokens + 1024))

    generation_config: dict[str, Any] = {
        "maxOutputTokens": effective_max_tokens,
        "temperature": temperature,
    }
    if model_lower.startswith("gemini-3"):
        generation_config["thinkingConfig"] = {
            "thinkingLevel": "LOW",
            "includeThoughts": False,
        }
    return generation_config


async def _call_google_generate_content(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    *,
    response_format: ResponseFormat = "text",
    json_schema: dict | None = None,
    feature: str = "unknown",
) -> tuple[str, dict[str, Any]]:
    client = await get_google_http_client(for_rag=_is_rag_feature(feature))
    normalized_messages, _ = _normalize_chat_messages(messages, user_message)
    effective_temperature = min(temperature, 0.1) if feature == "es_review" else temperature
    effective_system_prompt = _augment_system_prompt_for_provider_json(
        "google",
        system_prompt,
        response_format,
        json_schema,
    )
    request_body: dict[str, Any] = {
        "system_instruction": {"parts": [{"text": effective_system_prompt}]},
        "contents": _build_gemini_contents(normalized_messages),
        "generationConfig": _build_google_generation_config(
            model=model,
            max_tokens=max_tokens,
            temperature=effective_temperature,
        ),
    }

    if response_format in {"json_object", "json_schema"}:
        request_body["generationConfig"]["responseMimeType"] = "application/json"
        schema_body = _build_google_response_schema(json_schema)
        if response_format == "json_schema" and schema_body:
            request_body["generationConfig"]["responseSchema"] = schema_body

    response = await client.post(
        f"{settings.google_base_url}/models/{model}:generateContent",
        params={"key": settings.google_api_key},
        headers={"Content-Type": "application/json"},
        json=request_body,
    )
    response.raise_for_status()
    payload = response.json()
    return _extract_gemini_text(payload), payload


async def _repair_json_with_same_model(
    *,
    provider: LLMProvider,
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
        "あなたはJSON修復の専門家です。必ず有効なJSONのみを返してください。",
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


async def _call_openai_compatible(
    provider: Literal["openai", "cohere"],
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
    """OpenAI / OpenAI互換 Chat Completions API を呼び出す。"""
    if provider == "openai":
        client = await get_openai_client(for_rag=_is_rag_feature(feature))
    else:
        client = await get_openai_compatible_client(provider, for_rag=_is_rag_feature(feature))

    normalized_messages, _ = _normalize_chat_messages(messages, user_message)
    effective_system_prompt = _augment_system_prompt_for_provider_json(
        provider,
        system_prompt,
        response_format,
        json_schema,
    )
    api_messages = [{"role": "system", "content": effective_system_prompt}] + normalized_messages

    request_kwargs: dict[str, Any] = {
        "model": model,
        "messages": api_messages,
    }
    if provider == "openai" and _openai_uses_max_completion_tokens(model):
        request_kwargs["max_completion_tokens"] = max_tokens
    else:
        request_kwargs["max_tokens"] = max_tokens
    if provider != "openai" or _openai_supports_temperature(model):
        request_kwargs["temperature"] = temperature

    response_format_payload = _build_chat_response_format(provider, response_format, json_schema)
    if response_format_payload:
        request_kwargs["response_format"] = response_format_payload

    response = await client.chat.completions.create(**request_kwargs)

    content = response.choices[0].message.content
    if not content:
        print(f"[{_provider_display_name(provider)}] 空のレスポンスを受信")
        return None
    if settings.debug:
        open_braces = content.count("{") - content.count("}")
        open_brackets = content.count("[") - content.count("]")
        quote_count = content.count('"') - content.count('\\"')
        _log_debug(
            feature,
            f"{_provider_display_name(provider)} raw response stats: "
            f"chars={len(content)}, "
            f"open_braces={open_braces}, "
            f"open_brackets={open_brackets}, "
            f"unescaped_quotes={quote_count}, "
            f"truncation_suspected={_detect_truncation(content)}",
        )
    return _parse_json_response(content)


async def _call_openai_compatible_raw_text(
    provider: Literal["openai", "cohere"],
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    feature: str = "unknown",
) -> str:
    """OpenAI / OpenAI互換 Chat Completions API を呼び出し、生テキストを返す。"""
    if provider == "openai":
        client = await get_openai_client(for_rag=_is_rag_feature(feature))
    else:
        client = await get_openai_compatible_client(provider, for_rag=_is_rag_feature(feature))

    normalized_messages, _ = _normalize_chat_messages(messages, user_message)
    effective_system_prompt = _augment_system_prompt_for_provider_text(
        provider,
        system_prompt,
        feature=feature,
    )
    api_messages = [{"role": "system", "content": effective_system_prompt}] + normalized_messages

    request_kwargs: dict[str, Any] = {
        "model": model,
        "messages": api_messages,
    }
    if provider == "openai" and _openai_uses_max_completion_tokens(model):
        request_kwargs["max_completion_tokens"] = max_tokens
    else:
        request_kwargs["max_tokens"] = max_tokens
    if provider != "openai" or _openai_supports_temperature(model):
        request_kwargs["temperature"] = temperature

    response = await client.chat.completions.create(**request_kwargs)
    content = response.choices[0].message.content
    if not content:
        print(f"[{_provider_display_name(provider)}] 空のレスポンスを受信")
        return ""
    return content


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
        model: 明示的なモデル選択（エイリアス or 明示モデルID）
        feature: 自動モデル選択用の機能名
        disable_fallback: Trueの場合、別プロバイダーへのフォールバックを無効化

    Returns:
        LLMResult: 成功ステータス、データ、オプションのエラー詳細を含む
    """
    feature = feature or "unknown"
    requested_model = model or get_model_config().get(feature, "claude-sonnet")
    target = _resolve_model_target(feature, requested_model)

    if not _provider_has_api_key(target.provider):
        fallback_model = None if disable_fallback else _fallback_model_for_provider(target.provider)
        if fallback_model:
            _log(
                feature,
                f"{_provider_display_name(target.provider)} APIキー未設定、{fallback_model} にフォールバック",
                WARNING,
            )
            return await call_llm_with_error(
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
            )

        error = _create_error(
            "no_api_key",
            target.provider,
            feature,
            "利用可能なフォールバックAPIキーがありません",
        )
        _log(feature, "APIキーが設定されていません", ERROR)
        return LLMResult(success=False, error=error)

    model_display = get_model_display_name(target.actual_model)
    _log(feature, f"{model_display} を呼び出し中...")

    normalized_messages, used_user_message = _normalize_chat_messages(messages, user_message)
    if used_user_message:
        message_count = 1
        message_chars = len(user_message or "")
        message_mode = "user_message"
    else:
        message_count = len(normalized_messages)
        message_chars = sum(len(str(m.get("content", ""))) for m in normalized_messages)
        message_mode = "messages"

    _log_debug(
        feature,
        "LLM input size: "
        f"system={len(system_prompt)} chars, "
        f"{message_mode}={message_count} items/{message_chars} chars, "
        f"max_tokens={max_tokens}, temperature={temperature}, model={target.actual_model}",
    )

    try:
        effective_use_responses_api = bool(use_responses_api and target.provider == "openai")
        raw_response: str | None = None

        if target.provider == "anthropic":
            raw_response = await _call_claude_raw(
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
        elif target.provider == "google":
            raw_response, _ = await _call_google_generate_content(
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
            result = _parse_json_response(raw_response)
        elif effective_use_responses_api:
            result = await _call_openai_responses(
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
            result = await _call_openai_compatible(
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

        if result is not None:
            _log(feature, f"{model_display} で成功", SUCCESS)
            return LLMResult(success=True, data=result, raw_text=raw_response)

        if retry_on_parse:
            retry_note = parse_retry_instructions or (
                "必ず有効なJSONのみを出力してください。説明文やコードブロックは禁止です。"
                "文字列内の改行は\\nでエスケープしてください。"
            )
            retry_system_prompt = f"{system_prompt}\n\n# JSON出力の厳守\n{retry_note}"
            _log(feature, "JSON解析失敗、同一モデルで再試行します", WARNING)
            try:
                retry_result = await call_llm_with_error(
                    system_prompt=retry_system_prompt,
                    user_message=user_message,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    model=requested_model,
                    feature=feature,
                    response_format=response_format,
                    json_schema=json_schema,
                    use_responses_api=use_responses_api,
                    retry_on_parse=False,
                    disable_fallback=True,
                )
                if retry_result.success and retry_result.data:
                    _log(feature, f"{model_display} でリトライ成功", SUCCESS)
                    return retry_result
            except Exception as retry_err:
                _log(feature, f"リトライ失敗: {retry_err}", WARNING)

            repair_source = raw_response or ""
            if repair_source:
                _log(feature, "JSON修復を実行", WARNING)
                if target.provider == "anthropic":
                    repair_prompt = (
                        "以下の出力を、構造は変えずに有効なJSONに修復してください。"
                        "JSON以外は出力しないでください。\n\n"
                        f"{repair_source}"
                    )
                    repair_model = settings.claude_model
                    if "haiku" in repair_model.lower():
                        repair_model = "claude-sonnet-4-5-20250929"
                    raw_repair = await _call_claude_raw(
                        system_prompt="あなたはJSON修復の専門家です。必ずJSONのみ出力してください。",
                        user_message=repair_prompt,
                        messages=None,
                        max_tokens=min(max_tokens, 2000),
                        temperature=0.1,
                        model=repair_model,
                        feature=feature,
                    )
                    repair_result = _parse_json_response(raw_repair)
                    if repair_result is not None:
                        _log(feature, f"{model_display} でJSON修復成功", SUCCESS)
                        return LLMResult(success=True, data=repair_result, raw_text=raw_repair)
                else:
                    repair_result = await _repair_json_with_same_model(
                        provider=target.provider,
                        requested_model=requested_model,
                        raw_response=repair_source,
                        json_schema=json_schema,
                        feature=feature,
                        use_responses_api=use_responses_api,
                    )
                    if repair_result and repair_result.success and repair_result.data:
                        _log(feature, f"{model_display} でJSON修復成功", SUCCESS)
                        return repair_result

        fallback_model = None if disable_fallback else _fallback_model_for_provider(target.provider)
        if fallback_model:
            _log(feature, f"解析エラー、{fallback_model} にフォールバック", WARNING)
            try:
                fallback_result = await call_llm_with_error(
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
                )
                if fallback_result.success and fallback_result.data:
                    _log(feature, f"{fallback_model} へのフォールバック成功", SUCCESS)
                    return fallback_result
            except Exception as fallback_err:
                _log(feature, f"{fallback_model} フォールバック失敗: {fallback_err}", ERROR)

        error = _create_error("parse", target.provider, feature, "空または解析不能なレスポンス")
        _log(feature, "応答の解析に失敗しました", ERROR)
        return LLMResult(success=False, error=error, raw_text=raw_response)

    except (AnthropicAPIError, OpenAIAPIError, httpx.HTTPError) as e:
        error_type, detail = _classify_error_for_provider(target.provider, e)
        fallback_model = None
        if not disable_fallback and error_type in {"billing", "rate_limit", "network"}:
            fallback_model = _fallback_model_for_provider(target.provider)
        if fallback_model:
            _log(
                feature,
                f"{_provider_display_name(target.provider)} {error_type}、{fallback_model} にフォールバック",
                WARNING,
            )
            try:
                fallback_result = await call_llm_with_error(
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
                )
                if fallback_result.success and fallback_result.data:
                    _log(feature, f"{fallback_model} へのフォールバック成功", SUCCESS)
                    return fallback_result
            except Exception as fallback_err:
                _log(feature, f"{fallback_model} フォールバック失敗: {fallback_err}", ERROR)

        error = _create_error(error_type, target.provider, feature, detail)
        _log(feature, f"{_provider_display_name(target.provider)} APIエラー: {detail}", ERROR)
        return LLMResult(success=False, error=error)

    except Exception as e:
        error_type, detail = _classify_error_for_provider(target.provider, e)
        error = _create_error(error_type, target.provider, feature, detail)
        _log(feature, f"{_provider_display_name(target.provider)} 予期しないエラー: {e}", ERROR)
        return LLMResult(success=False, error=error)


async def call_llm_text_with_error(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None = None,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    model: LLMModel | None = None,
    feature: str | None = None,
    use_responses_api: bool = False,
    disable_fallback: bool = False,
) -> LLMResult:
    """Plain text response path with provider fallback and no JSON parsing."""
    feature = feature or "unknown"
    requested_model = model or get_model_config().get(feature, "claude-sonnet")
    target = _resolve_model_target(feature, requested_model)

    if not _provider_has_api_key(target.provider):
        fallback_model = None if disable_fallback else _fallback_model_for_provider(target.provider)
        if fallback_model:
            _log(
                feature,
                f"{_provider_display_name(target.provider)} APIキー未設定、{fallback_model} にフォールバック",
                WARNING,
            )
            return await call_llm_text_with_error(
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

        error = _create_error(
            "no_api_key",
            target.provider,
            feature,
            "利用可能なフォールバックAPIキーがありません",
        )
        _log(feature, "APIキーが設定されていません", ERROR)
        return LLMResult(success=False, error=error)

    model_display = get_model_display_name(target.actual_model)
    _log(feature, f"{model_display} を呼び出し中...")

    normalized_messages, used_user_message = _normalize_chat_messages(messages, user_message)
    if used_user_message:
        message_count = 1
        message_chars = len(user_message or "")
        message_mode = "user_message"
    else:
        message_count = len(normalized_messages)
        message_chars = sum(len(str(m.get("content", ""))) for m in normalized_messages)
        message_mode = "messages"

    _log_debug(
        feature,
        "LLM input size: "
        f"system={len(system_prompt)} chars, "
        f"{message_mode}={message_count} items/{message_chars} chars, "
        f"max_tokens={max_tokens}, temperature={temperature}, model={target.actual_model}",
    )

    try:
        raw_response = ""
        if target.provider == "anthropic":
            raw_response = await _call_claude_raw(
                system_prompt,
                user_message,
                normalized_messages,
                max_tokens,
                temperature,
                target.actual_model,
                feature=feature,
            )
        elif target.provider == "google":
            raw_response, _ = await _call_google_generate_content(
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
        elif use_responses_api and target.provider == "openai":
            raw_response = await _call_openai_responses_raw_text(
                system_prompt,
                user_message,
                normalized_messages,
                max_tokens,
                temperature,
                target.actual_model,
                feature=feature,
            )
        else:
            raw_response = await _call_openai_compatible_raw_text(
                provider=target.provider,
                system_prompt=system_prompt,
                user_message=user_message,
                messages=normalized_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                model=target.actual_model,
                feature=feature,
            )

        text_response = raw_response.strip() if raw_response else None
        if text_response:
            _log(feature, f"{model_display} で成功", SUCCESS)
            return LLMResult(success=True, data={"text": text_response}, raw_text=raw_response)

        fallback_model = None if disable_fallback else _fallback_model_for_provider(target.provider)
        if fallback_model:
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

        error = _create_error("parse", target.provider, feature, "空のテキストレスポンス")
        _log(feature, "応答の解析に失敗しました", ERROR)
        return LLMResult(success=False, error=error, raw_text=raw_response)

    except (AnthropicAPIError, OpenAIAPIError, httpx.HTTPError) as e:
        error_type, detail = _classify_error_for_provider(target.provider, e)
        error = _create_error(error_type, target.provider, feature, detail)
        _log(feature, f"{_provider_display_name(target.provider)} APIエラー: {detail}", ERROR)
        return LLMResult(success=False, error=error)

    except Exception as e:
        error_type, detail = _classify_error_for_provider(target.provider, e)
        error = _create_error(error_type, target.provider, feature, detail)
        _log(feature, f"{_provider_display_name(target.provider)} 予期しないエラー: {e}", ERROR)
        return LLMResult(success=False, error=error)


def _is_rag_feature(feature: str) -> bool:
    """機能がRAG関連かどうかを判定（短いタイムアウトを使用）。"""
    return feature in ("rag_query_expansion", "rag_hyde", "rag_rerank", "rag_classify")


def _normalize_chat_messages(
    messages: list[dict] | None,
    user_message: str,
) -> tuple[list[dict], bool]:
    """Treat an empty chat history the same as an omitted one."""
    if messages:
        return messages, False
    return [{"role": "user", "content": user_message}], True


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
    normalized_messages, _ = _normalize_chat_messages(messages, user_message)

    # 指定されたモデルを使用、なければclaude_model（Sonnet）をデフォルトに
    actual_model = model or settings.claude_model

    response = await client.messages.create(
        model=actual_model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=normalized_messages,
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
    normalized_messages, _ = _normalize_chat_messages(messages, user_message)

    actual_model = model or settings.claude_model

    async with client.messages.stream(
        model=actual_model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=normalized_messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
        final_message = await stream.get_final_message()
        stop_reason = getattr(final_message, "stop_reason", None)
        stop_sequence = getattr(final_message, "stop_sequence", None)
        if stop_reason:
            _log(feature, f"{get_model_display_name(actual_model)} stop_reason={stop_reason}", INFO)
        if stop_sequence:
            _log_debug(feature, f"stop_sequence={stop_sequence}")
        if stop_reason == "max_tokens":
            _log(feature, f"{get_model_display_name(actual_model)} が max_tokens={max_tokens} に到達", WARNING)


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


# ── Token-level streaming with field extraction ──────────────────────────


@dataclass
class StreamFieldEvent:
    """Event emitted during token-level streaming."""

    type: str  # "chunk", "string_chunk", "field_complete", "array_item_complete", "complete", "error"
    path: str = ""  # e.g., "scores", "top3.0", "rewrites.1"
    text: str = ""  # For chunk/string_chunk events
    value: object = None  # For field_complete/array_item_complete events
    result: Optional["LLMResult"] = None  # For complete event


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
    attempt_repair_on_parse_failure: bool = True,
    partial_required_fields: tuple[str, ...] | None = None,
) -> AsyncGenerator["StreamFieldEvent", None]:
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

    try:
        async for chunk in _call_claude_raw_stream(
            system_prompt=system_prompt,
            user_message=user_message,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            model=actual_model,
            feature=feature,
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

        result = _parse_json_response(accumulated)
        if result is not None:
            _log(feature, f"{model_display} フィールドストリーミング成功", SUCCESS)
            _anthropic_circuit.record_success()
            yield StreamFieldEvent(
                type="complete",
                result=LLMResult(success=True, data=result, raw_text=accumulated),
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
                result=LLMResult(success=True, data=partial, raw_text=accumulated),
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
            yield StreamFieldEvent(
                type="complete",
                result=LLMResult(success=True, data=repair_result, raw_text=accumulated),
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
                result=LLMResult(success=True, data=partial, raw_text=accumulated),
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
        _anthropic_circuit.record_failure()
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
    return await _call_openai_compatible(
        provider="openai",
        system_prompt=system_prompt,
        user_message=user_message,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
        response_format=response_format,
        json_schema=json_schema,
        feature=feature,
    )


async def _call_openai_raw_text(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    feature: str = "unknown",
) -> str:
    """OpenAI Chat Completions APIを呼び出し、生テキストを返す。"""
    return await _call_openai_compatible_raw_text(
        provider="openai",
        system_prompt=system_prompt,
        user_message=user_message,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        model=model,
        feature=feature,
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
) -> dict | None:
    """OpenAI Responses APIを呼び出す（オプションでStructured Outputs対応）。"""
    client = await get_openai_client(for_rag=_is_rag_feature(feature))
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


async def _call_openai_responses_raw_text(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    feature: str = "unknown",
) -> str:
    """OpenAI Responses APIを呼び出し、生テキストを返す。"""
    client = await get_openai_client(for_rag=_is_rag_feature(feature))
    normalized_messages, _ = _normalize_chat_messages(messages, user_message)
    input_messages = [{"role": "system", "content": system_prompt}] + normalized_messages

    request_kwargs = {
        "model": model,
        "input": input_messages,
        "max_output_tokens": max_tokens,
        "text": {"format": {"type": "text"}},
    }
    if _openai_supports_temperature(model):
        request_kwargs["temperature"] = temperature

    response = await client.responses.create(**request_kwargs)

    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text:
        return output_text

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
            if isinstance(text_payload, str) and text_payload:
                return text_payload

    return ""


async def extract_text_from_pdf_with_openai(
    pdf_bytes: bytes,
    filename: str,
    *,
    model: str | None = None,
    max_output_tokens: int = 12000,
    feature: str = "company_info",
) -> str:
    """
    Extract readable text from a PDF using OpenAI Responses API.

    Used as an OCR-capable fallback for uploaded PDFs, including scanned
    documents where local text extraction is unavailable or insufficient.
    """
    if not pdf_bytes:
        return ""

    client = await get_openai_client(for_rag=_is_rag_feature(feature))
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

    response = await client.responses.create(**request_kwargs)
    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text

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
                return text_payload

    return ""


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
        if settings.debug:
            print("[JSON解析] 空のコンテンツ")
        return None

    original_content = content

    # トランケーション検出
    if _detect_truncation(content):
        open_braces = content.count("{") - content.count("}")
        if settings.debug:
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
    if settings.debug:
        print(f"[JSON解析] ⚠️ 解析失敗（{len(original_content)}文字）: {preview[:100]}...")
    return None
