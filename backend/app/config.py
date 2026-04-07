from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, AliasChoices, model_validator, field_validator
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    """
    就活Pass API 設定

    全ての設定は環境変数から読み込まれます。
    環境変数が設定されていない場合はデフォルト値が使用されます。

    設定方法:
      1. .env.local (推奨) または .env ファイルに設定を記述
      2. 環境変数として直接設定

    詳細は .env.example を参照してください。
    """

    # ===== アプリケーション =====
    app_name: str = "就活Pass API"
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
    web_search_fast_max_queries: int = Field(
        default=4,
        validation_alias=AliasChoices("WEB_SEARCH_FAST_MAX_QUERIES"),
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
    internal_api_jwt_secret: str = Field(
        default="",
        validation_alias=AliasChoices("INTERNAL_API_JWT_SECRET"),
    )
    trusted_hosts: list[str] = Field(
        default=["localhost", "127.0.0.1"],
        validation_alias=AliasChoices("BACKEND_TRUSTED_HOSTS"),
    )

    @field_validator("trusted_hosts", mode="before")
    @classmethod
    def parse_trusted_hosts(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                return v
            return [item.strip() for item in s.split(",") if item.strip()]
        return v

    # ===== API キー =====
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""
    google_document_ai_project_id: str = ""
    google_document_ai_location: str = Field(
        default="us",
        validation_alias=AliasChoices("GOOGLE_DOCUMENT_AI_LOCATION"),
    )
    google_document_ai_processor_id: str = ""
    google_document_ai_service_account_json: str = ""
    mistral_api_key: str = ""
    firecrawl_api_key: str = ""
    firecrawl_base_url: str = Field(
        default="https://api.firecrawl.dev",
        validation_alias=AliasChoices("FIRECRAWL_BASE_URL"),
    )
    firecrawl_timeout_seconds: int = Field(
        default=30,
        validation_alias=AliasChoices("FIRECRAWL_TIMEOUT_SECONDS"),
    )

    # ===== キャッシュ =====
    # 環境変数: REDIS_URL
    redis_url: str = ""

    # ===== LLM 実モデル設定 =====
    # 機能別設定では stable alias を使い、ここで実際の版付き model ID を管理する。
    # 旧 env 名も fallback として受ける。
    claude_sonnet_model: str = Field(
        default="claude-sonnet-4-6",
        validation_alias=AliasChoices("CLAUDE_SONNET_MODEL", "CLAUDE_MODEL"),
    )

    claude_haiku_model: str = Field(
        default="claude-haiku-4-5-20251001",
        validation_alias=AliasChoices("CLAUDE_HAIKU_MODEL"),
    )

    gpt_model: str = Field(
        default="gpt-5.4",
        validation_alias=AliasChoices("GPT_MODEL"),
    )

    gpt_fast_model: str = Field(
        default="gpt-5.4-mini",
        validation_alias=AliasChoices("GPT_FAST_MODEL", "OPENAI_MODEL"),
    )

    gpt_nano_model: str = Field(
        default="gpt-5.4-nano",
        validation_alias=AliasChoices("GPT_NANO_MODEL"),
    )

    # Gemini モデル（Gemini API / OpenAI compatibility ではなく公式 API を使用）
    gemini_model: str = Field(
        default="gemini-3.1-pro-preview",
        validation_alias=AliasChoices("GEMINI_MODEL", "GOOGLE_MODEL"),
    )
    google_base_url: str = "https://generativelanguage.googleapis.com/v1beta"

    # 低コスト添削モード。ユーザー向けにはモデル名を出さず、コスト重視モードとして扱う。
    low_cost_review_model: str = Field(
        default="gpt-5.4-mini",
        validation_alias=AliasChoices("LOW_COST_REVIEW_MODEL"),
    )

    # ===== 機能別モデル設定 =====
    # ここには基本的に stable alias だけを保存する。
    # 推奨 alias:
    #   - claude-sonnet / claude-haiku
    #   - gpt / gpt-fast / gpt-nano
    #   - gemini
    #   - low-cost
    # 直指定 model ID や旧 alias（openai / google）も後方互換で解決する。
    model_es_review: str = "claude-sonnet"           # MODEL_ES_REVIEW
    model_gakuchika: str = "gpt-fast"                # MODEL_GAKUCHIKA
    model_motivation: str = "gpt-fast"               # MODEL_MOTIVATION
    model_interview: str = "gpt-fast"                # MODEL_INTERVIEW
    model_interview_feedback: str = Field(
        default="claude-sonnet",
        validation_alias=AliasChoices("MODEL_INTERVIEW_FEEDBACK"),
    )
    model_gakuchika_draft: str = Field(
        default="claude-sonnet",
        validation_alias=AliasChoices("MODEL_GAKUCHIKA_DRAFT"),
    )
    model_motivation_draft: str = Field(
        default="claude-sonnet",
        validation_alias=AliasChoices("MODEL_MOTIVATION_DRAFT"),
    )
    # 選考スケジュール抽出は呼び出し回数が多いため、コスト優先で GPT-5.4 nano（gpt-nano）を既定にする。
    model_selection_schedule: str = "gpt-nano"       # MODEL_SELECTION_SCHEDULE
    model_company_info: str = "gpt-fast"             # MODEL_COMPANY_INFO
    model_rag_query_expansion: str = "gpt-fast"      # MODEL_RAG_QUERY_EXPANSION（GPT-5.4 mini）
    model_rag_hyde: str = "gpt-fast"                 # MODEL_RAG_HYDE（GPT-5.4 mini）
    # RAG 補助 LLM で nano なのは分類のみ。チャンク content_type 推定（短い JSON）。再ランキングは cross-encoder（reranker.py）
    model_rag_classify: str = "gpt-nano"             # MODEL_RAG_CLASSIFY（GPT-5.4 nano）

    # 開発者向け: LLM トークン・概算 USD/JPY を logger.info（event=llm_cost）で出力。ENVIRONMENT に依存しない。
    llm_usage_cost_log: bool = Field(
        default=False,
        validation_alias=AliasChoices("LLM_USAGE_COST_LOG"),
    )
    # 開発者向け詳細: 既存の call 単位 event=llm_cost を追加で出す。既定は summary only。
    llm_usage_cost_debug_log: bool = Field(
        default=False,
        validation_alias=AliasChoices("LLM_USAGE_COST_DEBUG_LOG"),
    )
    # 以下は USD / 1M tokens。いずれか未設定の場合、est_usd はログに含めない。
    openai_price_gpt_5_4_mini_input_per_mtok_usd: float | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_PRICE_GPT_5_4_MINI_INPUT_PER_MTOK_USD"),
    )
    openai_price_gpt_5_4_mini_cached_input_per_mtok_usd: float | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_PRICE_GPT_5_4_MINI_CACHED_INPUT_PER_MTOK_USD"),
    )
    openai_price_gpt_5_4_mini_output_per_mtok_usd: float | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_PRICE_GPT_5_4_MINI_OUTPUT_PER_MTOK_USD"),
    )
    openai_price_gpt_5_4_nano_input_per_mtok_usd: float | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_PRICE_GPT_5_4_NANO_INPUT_PER_MTOK_USD"),
    )
    openai_price_gpt_5_4_nano_cached_input_per_mtok_usd: float | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_PRICE_GPT_5_4_NANO_CACHED_INPUT_PER_MTOK_USD"),
    )
    openai_price_gpt_5_4_nano_output_per_mtok_usd: float | None = Field(
        default=None,
        validation_alias=AliasChoices("OPENAI_PRICE_GPT_5_4_NANO_OUTPUT_PER_MTOK_USD"),
    )
    # est_usd に掛けて開発者ログに est_jpy を付与（例: 155）。未設定なら円は出さない。
    llm_cost_usd_to_jpy_rate: float | None = Field(
        default=None,
        validation_alias=AliasChoices("LLM_COST_USD_TO_JPY_RATE"),
    )

    # LLM タイムアウト（秒）
    # 環境変数: LLM_TIMEOUT_SECONDS
    # ES添削等の重い処理向け（max_tokens=3000-4500）
    llm_timeout_seconds: int = 120

    # RAG処理用タイムアウト（秒）
    # 環境変数: RAG_TIMEOUT_SECONDS
    # クエリ拡張・HyDE・コンテンツ分類等の軽量 LLM 向け（再ランキングは cross-encoder）
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

    # 企業RAG PDF アップロード上限（ページ）。Free 厳しめ / Standard・Pro は緩め。超過分は先頭ページのみ処理。
    rag_pdf_max_pages_free: int = Field(
        default=20,
        validation_alias=AliasChoices("RAG_PDF_MAX_PAGES_FREE"),
    )
    rag_pdf_max_pages_standard: int = Field(
        default=60,
        validation_alias=AliasChoices("RAG_PDF_MAX_PAGES_STANDARD"),
    )
    rag_pdf_max_pages_pro: int = Field(
        default=120,
        validation_alias=AliasChoices("RAG_PDF_MAX_PAGES_PRO"),
    )
    # OpenAI PDF OCR 時に送る最大ページ数（≤ 上記取込上限）。OCR 負荷抑制用。
    rag_pdf_google_ocr_max_pages_free: int = Field(
        default=5,
        validation_alias=AliasChoices("RAG_PDF_GOOGLE_OCR_MAX_PAGES_FREE", "RAG_PDF_OCR_MAX_PAGES_FREE"),
    )
    rag_pdf_google_ocr_max_pages_standard: int = Field(
        default=30,
        validation_alias=AliasChoices("RAG_PDF_GOOGLE_OCR_MAX_PAGES_STANDARD", "RAG_PDF_OCR_MAX_PAGES_STANDARD"),
    )
    rag_pdf_google_ocr_max_pages_pro: int = Field(
        default=60,
        validation_alias=AliasChoices("RAG_PDF_GOOGLE_OCR_MAX_PAGES_PRO", "RAG_PDF_OCR_MAX_PAGES_PRO"),
    )
    rag_pdf_mistral_ocr_max_pages_free: int = Field(
        default=0,
        validation_alias=AliasChoices("RAG_PDF_MISTRAL_OCR_MAX_PAGES_FREE"),
    )
    rag_pdf_mistral_ocr_max_pages_standard: int = Field(
        default=10,
        validation_alias=AliasChoices("RAG_PDF_MISTRAL_OCR_MAX_PAGES_STANDARD"),
    )
    rag_pdf_mistral_ocr_max_pages_pro: int = Field(
        default=20,
        validation_alias=AliasChoices("RAG_PDF_MISTRAL_OCR_MAX_PAGES_PRO"),
    )
    rag_pdf_ocr_timeout_seconds: int = Field(
        default=120,
        validation_alias=AliasChoices("RAG_PDF_OCR_TIMEOUT_SECONDS"),
    )
    pdf_ocr_timeout_seconds: int = Field(
        default=120,
        validation_alias=AliasChoices("PDF_OCR_TIMEOUT_SECONDS", "RAG_PDF_OCR_TIMEOUT_SECONDS"),
    )
    pdf_ocr_min_total_chars: int = Field(
        default=200,
        validation_alias=AliasChoices("PDF_OCR_MIN_TOTAL_CHARS"),
    )
    pdf_ocr_min_chars_per_page: int = Field(
        default=120,
        validation_alias=AliasChoices("PDF_OCR_MIN_CHARS_PER_PAGE"),
    )
    pdf_ocr_high_accuracy_min_pages: int = Field(
        default=8,
        validation_alias=AliasChoices("PDF_OCR_HIGH_ACCURACY_MIN_PAGES"),
    )
    pdf_ocr_google_weak_chars_per_page: int = Field(
        default=250,
        validation_alias=AliasChoices("PDF_OCR_GOOGLE_WEAK_CHARS_PER_PAGE"),
    )
    pdf_ocr_google_weak_quality_score: float = Field(
        default=0.65,
        validation_alias=AliasChoices("PDF_OCR_GOOGLE_WEAK_QUALITY_SCORE"),
    )
    # 開発用: 企業PDF取込の 1 行テレメトリ（OCR 有無・ページ・秒・概算コスト）
    company_pdf_ingest_telemetry_log: bool = Field(
        default=False,
        validation_alias=AliasChoices("COMPANY_PDF_INGEST_TELEMETRY_LOG"),
    )

    # ===== ES添削 文字数制御設定 =====
    # 文字数制限の許容幅（パーセント）
    # 環境変数: ES_CHAR_TOLERANCE_PERCENT
    # 例: 0.10 = 10% → 400文字制限で40文字の許容幅
    es_char_tolerance_percent: float = 0.10

    # 文字数制限の最小許容幅（文字数）
    # 環境変数: ES_CHAR_TOLERANCE_MIN
    # 短い制限でも最低この文字数の幅を確保
    es_char_tolerance_min: int = 20

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
