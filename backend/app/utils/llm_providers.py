"""
LLM プロバイダー関連ユーティリティモジュール

プロバイダー固有のクライアント生成、エラー分類、使用量抽出、
プロンプト/スキーマ加工、および各プロバイダー呼び出し実装を提供する。
llm.py から分離し、循環インポートを避けるため llm.py への参照は
関数内の遅延インポートで行う。
"""

import httpx
import json
from anthropic import AsyncAnthropic
import openai
from app.config import settings
from app.utils.llm_client_registry import get_registry
from app.utils.llm_model_routing import (
    LLMProvider,
    ResponseFormat,
    get_model_display_name,
)
from app.utils.secure_logger import get_logger
from typing import Any, AsyncGenerator, Callable, Literal
from dataclasses import dataclass

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FEATURE_NAMES = {
    "es_review": "ES添削",
    "gakuchika": "ガクチカ深掘り",
    "motivation": "志望動機作成",
    "interview": "面接対策",
    "interview_feedback": "面接最終講評",
    "gakuchika_draft": "ガクチカES下書き",
    "motivation_draft": "志望動機ES下書き",
    "selection_schedule": "選考スケジュール抽出",
    "company_info": "企業情報抽出",
    "rag_query_expansion": "RAGクエリ拡張",
    "rag_hyde": "RAG仮想文書生成",
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
    "rag_classify",
}

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------


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
    }.get(provider, provider)


# ---------------------------------------------------------------------------
# Client factory functions (mutable state owned by llm_client_registry)
# ---------------------------------------------------------------------------


async def get_anthropic_client(for_rag: bool = False) -> AsyncAnthropic:
    """Anthropicクライアントを取得または作成（コネクションプーリング対応、スレッドセーフ）。"""
    registry = get_registry()

    async with registry.client_lock:
        if for_rag:
            if registry.anthropic_client_rag is None:
                registry.anthropic_client_rag = AsyncAnthropic(
                    api_key=settings.anthropic_api_key,
                    timeout=settings.rag_timeout_seconds,
                )
            return registry.anthropic_client_rag
        if registry.anthropic_client is None:
            registry.anthropic_client = AsyncAnthropic(
                api_key=settings.anthropic_api_key,
                timeout=settings.llm_timeout_seconds,
            )
        return registry.anthropic_client


async def get_openai_client(for_rag: bool = False) -> openai.AsyncOpenAI:
    """OpenAIクライアントを取得または作成（コネクションプーリング対応、スレッドセーフ）。"""
    registry = get_registry()

    async with registry.client_lock:
        if for_rag:
            if registry.openai_client_rag is None:
                registry.openai_client_rag = openai.AsyncOpenAI(
                    api_key=settings.openai_api_key,
                    timeout=settings.rag_timeout_seconds,
                )
            return registry.openai_client_rag
        if registry.openai_client is None:
            registry.openai_client = openai.AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.llm_timeout_seconds,
            )
        return registry.openai_client


async def get_google_http_client(for_rag: bool = False) -> httpx.AsyncClient:
    """Gemini API用 HTTP クライアントを取得する。"""
    registry = get_registry()

    timeout = settings.rag_timeout_seconds if for_rag else settings.llm_timeout_seconds

    async with registry.client_lock:
        if for_rag:
            if registry.google_http_client_rag is None:
                registry.google_http_client_rag = httpx.AsyncClient(timeout=timeout)
            return registry.google_http_client_rag

        if registry.google_http_client is None:
            registry.google_http_client = httpx.AsyncClient(timeout=timeout)
        return registry.google_http_client


# ---------------------------------------------------------------------------
# Prompt / schema building
# ---------------------------------------------------------------------------


def _requires_json_prompt_hint(provider: LLMProvider) -> bool:
    return provider == "google"


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
    strict_note_template = (
        "\n\n# JSON出力の厳守\n"
        "必ず有効なJSONのみを返してください。説明文、前置き、コードブロックは禁止です。"
        "\n先頭文字は {{、末尾文字は }} にしてください。"
        "\n期待するJSONの骨組み:\n"
        "{schema_example}"
    )
    strict_note = strict_note_template.format(
        schema_example=json.dumps(schema_example, ensure_ascii=False)
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
    provider: Literal["openai"],
    response_format: ResponseFormat,
    json_schema: dict | None,
) -> dict[str, Any] | None:
    if response_format == "text":
        return None

    if response_format == "json_schema" and json_schema:
        schema_body = _schema_body(json_schema)
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


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class LLMError:
    """LLMエラーの詳細情報。"""

    error_type: str  # "no_api_key", "billing", "rate_limit", "invalid_key", "network", "parse", "refusal", "unknown"
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
    usage: dict[str, int] | None = None
    # API に渡した実モデル ID（ログ・コスト集計用）
    resolved_model: str | None = None


def _create_error(
    error_type: str, provider: str, feature: str, detail: str = ""
) -> LLMError:
    """ユーザーフレンドリーなメッセージ付きの詳細エラーを作成。"""
    feature_name = FEATURE_NAMES.get(feature, feature)
    provider_name = _provider_display_name(provider)

    messages = {
        "no_api_key": "AI機能の設定に問題があります。管理者にお問い合わせください。",
        "billing": f"{provider_name}のクレジット残高が不足しています。APIダッシュボードでクレジットを追加してください。",
        "rate_limit": f"{provider_name}のレート制限に達しました。しばらく待ってから再度お試しください。",
        "invalid_key": f"{provider_name}のAPIキーが無効です。正しいAPIキーを設定してください。",
        "network": f"{provider_name}への接続に失敗しました。ネットワーク接続を確認してください。",
        "parse": "AIからの応答を解析できませんでした。もう一度お試しください。",
        "refusal": "AIが安全上の理由で応答を返せませんでした。入力内容や条件を見直して、もう一度お試しください。",
        "unknown": f"{feature_name}の処理中にエラーが発生しました。しばらくしてから再度お試しください。",
    }

    return LLMError(
        error_type=error_type,
        message=messages.get(error_type, messages["unknown"]),
        detail=detail,
        provider=provider,
        feature=feature,
    )


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------


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


def _extract_gemini_usage_summary(payload: dict[str, Any]) -> dict[str, int]:
    usage = payload.get("usageMetadata") or {}
    return {
        "input_tokens": int(usage.get("promptTokenCount") or 0),
        "output_tokens": int(usage.get("candidatesTokenCount") or 0),
        "reasoning_tokens": int(usage.get("thoughtsTokenCount") or 0),
        "cached_input_tokens": int(usage.get("cachedContentTokenCount") or 0),
    }


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


# ---------------------------------------------------------------------------
# Usage extraction
# ---------------------------------------------------------------------------


def _extract_anthropic_usage_summary(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None) or {}

    def _get(obj: Any, key: str) -> int:
        if isinstance(obj, dict):
            return int(obj.get(key) or 0)
        return int(getattr(obj, key, 0) or 0)

    return {
        "input_tokens": _get(usage, "input_tokens"),
        "output_tokens": _get(usage, "output_tokens"),
        "reasoning_tokens": 0,
        "cached_input_tokens": _get(usage, "cache_read_input_tokens"),
    }


def _extract_openai_chat_usage_summary(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None) or {}

    def _get(obj: Any, key: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(key)
        return getattr(obj, key, None)

    prompt_details = _get(usage, "prompt_tokens_details") or {}
    completion_details = _get(usage, "completion_tokens_details") or {}

    return {
        "input_tokens": int(_get(usage, "prompt_tokens") or 0),
        "output_tokens": int(_get(usage, "completion_tokens") or 0),
        "reasoning_tokens": int(_get(completion_details, "reasoning_tokens") or 0),
        "cached_input_tokens": int(_get(prompt_details, "cached_tokens") or 0),
    }


# ---------------------------------------------------------------------------
# Shared utility functions
# ---------------------------------------------------------------------------


def _is_rag_feature(feature: str) -> bool:
    """機能がRAG関連かどうかを判定（短いタイムアウトを使用）。"""
    return feature in ("rag_query_expansion", "rag_hyde", "rag_classify")


def _normalize_chat_messages(
    messages: list[dict] | None,
    user_message: str,
) -> tuple[list[dict], bool]:
    """Treat an empty chat history the same as an omitted one."""
    if messages:
        return messages, False
    return [{"role": "user", "content": user_message}], True


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


# ---------------------------------------------------------------------------
# OpenAI helpers
# ---------------------------------------------------------------------------


def _openai_supports_temperature(model: str) -> bool:
    """temperature設定を拒否するOpenAIモデル（例: GPT-5）の場合はFalseを返す。"""
    model_lower = (model or "").lower()
    return not model_lower.startswith("gpt-5")


def _openai_uses_max_completion_tokens(model: str) -> bool:
    """max_completion_tokensを必要とするOpenAIモデル（例: GPT-5）の場合はTrueを返す。"""
    model_lower = (model or "").lower()
    return model_lower.startswith("gpt-5")


# ---------------------------------------------------------------------------
# Provider call implementations
# ---------------------------------------------------------------------------


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


async def _call_claude_raw(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str | None = None,
    feature: str = "unknown",
) -> tuple[str, dict[str, int] | None]:
    """Claude APIを呼び出し、生のテキストを返す。"""
    client = await get_anthropic_client(for_rag=_is_rag_feature(feature))
    normalized_messages, _ = _normalize_chat_messages(messages, user_message)

    # 指定されたモデルを使用、なければclaude_model（Sonnet）をデフォルトに
    actual_model = model or settings.claude_sonnet_model

    response = await client.messages.create(
        model=actual_model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=normalized_messages,
    )

    if not response.content:
        print("[Claude] 空のレスポンスを受信")
        return "", _extract_anthropic_usage_summary(response)

    return response.content[0].text or "", _extract_anthropic_usage_summary(response)


async def _call_claude_raw_stream(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str | None = None,
    feature: str = "unknown",
    on_complete: Callable[[dict[str, int] | None], None] | None = None,
) -> AsyncGenerator[str, None]:
    """Claude APIをストリーミングで呼び出し、テキストチャンクを逐次返す。"""
    client = await get_anthropic_client(for_rag=_is_rag_feature(feature))
    normalized_messages, _ = _normalize_chat_messages(messages, user_message)

    actual_model = model or settings.claude_sonnet_model

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
        if on_complete:
            on_complete(_extract_anthropic_usage_summary(final_message))
        stop_reason = getattr(final_message, "stop_reason", None)
        stop_sequence = getattr(final_message, "stop_sequence", None)
        if stop_reason:
            _log(feature, f"{get_model_display_name(actual_model)} stop_reason={stop_reason}", INFO)
        if stop_sequence:
            _log_debug(feature, f"stop_sequence={stop_sequence}")
        if stop_reason == "max_tokens":
            _log(feature, f"{get_model_display_name(actual_model)} が max_tokens={max_tokens} に到達", WARNING)


async def _call_openai_compatible(
    provider: Literal["openai"],
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    response_format: ResponseFormat = "json_object",
    json_schema: dict | None = None,
    feature: str = "unknown",
) -> tuple[dict | None, dict[str, int] | None]:
    """OpenAI Chat Completions API を呼び出す。"""
    client = await get_openai_client(for_rag=_is_rag_feature(feature))

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
    if _openai_uses_max_completion_tokens(model):
        request_kwargs["max_completion_tokens"] = max_tokens
    else:
        request_kwargs["max_tokens"] = max_tokens
    if _openai_supports_temperature(model):
        request_kwargs["temperature"] = temperature

    response_format_payload = _build_chat_response_format(provider, response_format, json_schema)
    if response_format_payload:
        request_kwargs["response_format"] = response_format_payload

    response = await client.chat.completions.create(**request_kwargs)

    usage_summary = _extract_openai_chat_usage_summary(response)
    content = response.choices[0].message.content
    if not content:
        print(f"[{_provider_display_name(provider)}] 空のレスポンスを受信")
        return None, usage_summary
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
    return _parse_json_response(content), usage_summary


async def _call_openai_compatible_raw_text(
    provider: Literal["openai"],
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    feature: str = "unknown",
) -> tuple[str, dict[str, int] | None]:
    """OpenAI Chat Completions API を呼び出し、生テキストを返す。"""
    client = await get_openai_client(for_rag=_is_rag_feature(feature))

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
    if _openai_uses_max_completion_tokens(model):
        request_kwargs["max_completion_tokens"] = max_tokens
    else:
        request_kwargs["max_tokens"] = max_tokens
    if _openai_supports_temperature(model):
        request_kwargs["temperature"] = temperature
    if feature == "es_review":
        request_kwargs["verbosity"] = "medium"
        request_kwargs["prompt_cache_key"] = f"es_review:text:{model}"

    response = await client.chat.completions.create(**request_kwargs)
    usage_summary = _extract_openai_chat_usage_summary(response)
    content = response.choices[0].message.content
    if not content:
        print(f"[{_provider_display_name(provider)}] 空のレスポンスを受信")
        return "", usage_summary
    return content, usage_summary


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
    result, _ = await _call_openai_compatible(
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
    return result


async def _call_openai_raw_text(
    system_prompt: str,
    user_message: str,
    messages: list[dict] | None,
    max_tokens: int,
    temperature: float,
    model: str,
    feature: str = "unknown",
) -> tuple[str, dict[str, int] | None]:
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
