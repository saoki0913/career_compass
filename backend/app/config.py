from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, AliasChoices, model_validator, field_validator
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    """
    就活Compass API 設定

    全ての設定は環境変数から読み込まれます。
    環境変数が設定されていない場合はデフォルト値が使用されます。

    設定方法:
      1. .env.local (推奨) または .env ファイルに設定を記述
      2. 環境変数として直接設定

    詳細は .env.example を参照してください。
    """

    # ===== アプリケーション =====
    app_name: str = "就活Compass API"
    debug: bool = False
    company_search_debug: bool = False
    web_search_debug: bool = Field(
        default=False,
        validation_alias=AliasChoices("WEB_SEARCH_DEBUG"),
    )
    company_search_hybrid: bool = Field(
        default=False,
        validation_alias=AliasChoices("USE_HYBRID_SEARCH"),
    )

    # ===== CORS =====
    # Override via CORS_ORIGINS env var (JSON array string, e.g. '["http://localhost:3000","https://your-domain.com"]')
    cors_origins: list[str] = Field(
        default=["http://localhost:3000"],
        validation_alias=AliasChoices("CORS_ORIGINS"),
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """
        Support multiple formats for CORS_ORIGINS:
          - JSON array string: '["https://a.com","https://b.com"]' (recommended)
          - Comma-separated: "https://a.com,https://b.com"
        """
        if v is None:
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                # Let Pydantic parse JSON array strings.
                return v
            return [item.strip() for item in s.split(",") if item.strip()]
        return v

    # ===== データベース =====
    # NOTE: メインDBは Next.js (フロントエンド) が Supabase (PostgreSQL) に接続します。
    # FastAPI バックエンドは DB に直接接続しません。

    # ===== フロントエンド =====
    frontend_url: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("FRONTEND_URL", "NEXT_PUBLIC_APP_URL"),
    )

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

    # ===== 機能別モデル設定 =====
    # 各機能で使用するLLMモデルティア（claude-sonnet / claude-haiku / openai）
    # .env.local で個別にオーバーライド可能
    model_es_review: str = "claude-sonnet"          # MODEL_ES_REVIEW - ES添削
    model_gakuchika: str = "claude-haiku"           # MODEL_GAKUCHIKA - ガクチカ深掘り
    model_motivation: str = "claude-haiku"          # MODEL_MOTIVATION - 志望動機作成
    model_selection_schedule: str = "claude-haiku"  # MODEL_SELECTION_SCHEDULE - 選考スケジュール抽出
    model_company_info: str = "openai"              # MODEL_COMPANY_INFO - 企業情報抽出
    model_rag_query_expansion: str = "claude-haiku"  # MODEL_RAG_QUERY_EXPANSION - RAGクエリ拡張
    model_rag_hyde: str = "claude-sonnet"           # MODEL_RAG_HYDE - RAG仮想文書生成
    model_rag_rerank: str = "claude-sonnet"         # MODEL_RAG_RERANK - RAG再ランキング
    model_rag_classify: str = "claude-haiku"        # MODEL_RAG_CLASSIFY - RAGコンテンツ分類

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

    # ===== RAG 検索チューニング設定 =====
    # ハイブリッド検索の重み（semantic + keyword = 1.0 を推奨）
    rag_semantic_weight: float = 0.6
    rag_keyword_weight: float = 0.4
    # 再ランキング実行閾値（低いほど実行されやすい）
    rag_rerank_threshold: float = 0.7
    # クエリ拡張/HyDE/MMR/リランクの有効化
    rag_use_query_expansion: bool = True
    rag_use_hyde: bool = True
    rag_use_mmr: bool = True
    rag_use_rerank: bool = True
    # MMRの多様性係数（0=多様性重視、1=関連性重視）
    rag_mmr_lambda: float = 0.5
    # 取得候補数（kの最小値、n_results*3と比較して大きい方を使用）
    rag_fetch_k: int = 30
    # クエリ拡張数と最大総クエリ数
    rag_max_queries: int = 3
    rag_max_total_queries: int = 4
    # コンテキスト長の動的調整（ES文字数に応じて使用）
    rag_context_threshold_short: int = 500
    rag_context_threshold_medium: int = 1000
    rag_context_short: int = 1500
    rag_context_medium: int = 2500
    rag_context_long: int = 3000
    # RAGコンテキストの最小文字数（不足時は無効化）
    rag_min_context_chars: int = 200

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
    # 3回で十分（タイムアウト防止のため）
    es_template_max_retries: int = 3

    # 条件付き追加リトライを有効にするか
    # 環境変数: ES_ENABLE_CONDITIONAL_RETRY
    # 2/3パターン成功時に追加リトライを行う
    es_enable_conditional_retry: bool = True

    # リライト案の最大出力数
    # 環境変数: ES_REWRITE_COUNT
    # 1=ユーザーが迷わない、最大3まで設定可能
    es_rewrite_count: int = 1

    @model_validator(mode="after")
    def validate_cors_origins(self):
        """Validate that CORS origins do not contain wildcard '*'."""
        if "*" in self.cors_origins:
            raise ValueError(
                "CORS wildcard '*' is not allowed in production. "
                "Please specify explicit origins in CORS_ORIGINS environment variable."
            )
        return self

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
