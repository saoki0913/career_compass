"""
LLMクライアントレジストリ。

LLM基盤のミュータブル状態（プロバイダークライアント、クライアントロック、
サーキットブレーカー、キャッシュされたモデル設定）を単一のレジストリに
集約する。これにより `app.utils.llm` からモジュールレベルのシングルトンを
取り除き、テストはモジュール属性をモンキーパッチする代わりにレジストリを
入れ替えることで状態をリセットできる。

循環依存を避けるため、この module は `llm.py` / `llm_providers.py` /
`llm_model_routing.py` のいずれにも依存しない。CircuitBreaker もこの
module で定義し、他の module はここから import する。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from app.utils.llm_model_routing import LLMModel, LLMProvider


# ---------------------------------------------------------------------------
# CircuitBreaker
# ---------------------------------------------------------------------------


@dataclass
class CircuitBreaker:
    """連鎖障害を防ぐためのサーキットブレーカー。"""

    failures: int = 0
    last_failure: Optional[datetime] = None
    threshold: int = 3
    reset_timeout: timedelta = field(default_factory=lambda: timedelta(minutes=5))

    def is_open(self) -> bool:
        """サーキットが open (このプロバイダーをスキップすべき) かを返す。"""
        if self.failures < self.threshold:
            return False
        if (
            self.last_failure
            and datetime.now() - self.last_failure > self.reset_timeout
        ):
            self.reset()
            return False
        return True

    def record_failure(self) -> None:
        """失敗を記録する。"""
        self.failures += 1
        self.last_failure = datetime.now()

    def record_success(self) -> None:
        """成功を記録し、サーキットをリセットする。"""
        self.reset()

    def reset(self) -> None:
        """サーキットブレーカーをリセットする。"""
        self.failures = 0
        self.last_failure = None


# ---------------------------------------------------------------------------
# LLMClientRegistry
# ---------------------------------------------------------------------------


@dataclass
class LLMClientRegistry:
    """LLM基盤のミュータブル状態を保持するレジストリ。

    テストは `reset_registry()` もしくは `set_registry(LLMClientRegistry())`
    を呼ぶことで、モジュール属性のモンキーパッチなしに状態をリセットできる。
    """

    anthropic_client: Any = None  # AsyncAnthropic
    anthropic_client_rag: Any = None  # AsyncAnthropic
    openai_client: Any = None  # openai.AsyncOpenAI
    openai_client_rag: Any = None  # openai.AsyncOpenAI
    google_http_client: Any = None  # httpx.AsyncClient
    google_http_client_rag: Any = None  # httpx.AsyncClient
    client_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    anthropic_circuit: CircuitBreaker = field(default_factory=CircuitBreaker)
    openai_circuit: CircuitBreaker = field(default_factory=CircuitBreaker)
    model_config: Optional[dict[str, "LLMModel"]] = None


# ---------------------------------------------------------------------------
# Module-level singleton access
# ---------------------------------------------------------------------------


_registry: LLMClientRegistry = LLMClientRegistry()


def get_registry() -> LLMClientRegistry:
    """現在アクティブなレジストリを返す。"""
    return _registry


def set_registry(registry: LLMClientRegistry) -> None:
    """アクティブなレジストリを差し替える（主にテスト用）。"""
    global _registry
    _registry = registry


def reset_registry() -> LLMClientRegistry:
    """新しいレジストリを生成して差し替え、それを返す（主にテスト用）。"""
    fresh = LLMClientRegistry()
    set_registry(fresh)
    return fresh


def get_circuit_breaker(provider: "LLMProvider") -> CircuitBreaker:
    """プロバイダーに対応するサーキットブレーカーを返す。"""
    reg = get_registry()
    if provider == "anthropic":
        return reg.anthropic_circuit
    if provider == "openai":
        return reg.openai_circuit
    raise ValueError(f"No circuit breaker for provider: {provider}")


__all__ = [
    "CircuitBreaker",
    "LLMClientRegistry",
    "get_registry",
    "set_registry",
    "reset_registry",
    "get_circuit_breaker",
]
