from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    """
    Career Compass API 設定

    全ての設定は環境変数から読み込まれます。
    環境変数が設定されていない場合はデフォルト値が使用されます。

    設定方法:
      1. .env.local (推奨) または .env ファイルに設定を記述
      2. 環境変数として直接設定

    詳細は .env.example を参照してください。
    """

    # ===== アプリケーション =====
    app_name: str = "Career Compass API"
    debug: bool = False
    company_search_debug: bool = False

    # ===== CORS =====
    cors_origins: list[str] = ["http://localhost:3000"]

    # ===== データベース (Turso) =====
    turso_database_url: str = ""
    turso_auth_token: str = ""

    # ===== フロントエンド =====
    frontend_url: str = "http://localhost:3000"

    # ===== API キー =====
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # ===== キャッシュ =====
    # 環境変数: REDIS_URL
    redis_url: str = ""

    # ===== LLM モデル設定 =====
    # Claude モデル（ES添削・ガクチカ深掘りに使用）
    # 環境変数: CLAUDE_MODEL
    # 推奨: claude-sonnet-4-5-20250929 (本番), claude-haiku-4-5-20251001 (開発)
    claude_model: str = "claude-sonnet-4-5-20250929"

    # Claude Haiku モデル（選考スケジュール抽出に使用）
    # 環境変数: CLAUDE_HAIKU_MODEL
    claude_haiku_model: str = "claude-haiku-4-5-20251001"

    # OpenAI モデル（汎用デフォルト）
    # 環境変数: OPENAI_MODEL
    openai_model: str = "gpt-5-mini"

    # LLM タイムアウト（秒）
    # 環境変数: LLM_TIMEOUT_SECONDS
    # ES添削等の重い処理向け（max_tokens=3000-4500）
    llm_timeout_seconds: int = 120

    # RAG処理用タイムアウト（秒）
    # 環境変数: RAG_TIMEOUT_SECONDS
    # クエリ拡張・HyDE・再ランキング等の軽量処理向け
    rag_timeout_seconds: int = 45

    # ===== RAG 埋め込み設定 =====
    # 環境変数: OPENAI_EMBEDDING_MODEL
    openai_embedding_model: str = "text-embedding-3-small"
    # 環境変数: EMBEDDING_MAX_INPUT_CHARS
    embedding_max_input_chars: int = 8000

    # ===== ES添削 文字数制御設定 =====
    # 文字数制限の許容幅（パーセント）
    # 環境変数: ES_CHAR_TOLERANCE_PERCENT
    # 例: 0.10 = 10% → 400文字制限で40文字の許容幅
    es_char_tolerance_percent: float = 0.10

    # 文字数制限の最小許容幅（文字数）
    # 環境変数: ES_CHAR_TOLERANCE_MIN
    # 短い制限でも最低この文字数の幅を確保
    es_char_tolerance_min: int = 20

    # テンプレート添削の最大リトライ回数
    # 環境変数: ES_TEMPLATE_MAX_RETRIES
    # 複雑な3パターン出力には3回以上を推奨
    es_template_max_retries: int = 3

    # 条件付き追加リトライを有効にするか
    # 環境変数: ES_ENABLE_CONDITIONAL_RETRY
    # 2/3パターン成功時に追加リトライを行う
    es_enable_conditional_retry: bool = True

    model_config = SettingsConfigDict(
        # Try multiple env file locations
        # Path: backend/app/config.py → .parent = app/ → .parent.parent = backend/ → .parent.parent.parent = career_compass/
        env_file=(
            Path(__file__).parent.parent.parent / ".env.local",  # Root .env.local
            Path(__file__).parent.parent.parent / ".env",  # Root .env
            ".env",  # Local .env (for Docker/deployment)
        ),
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore extra env vars
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
