# 環境変数一覧（クイックリファレンス）

[← 目次に戻る](./PRODUCTION.md)

---

## Vercel (フロントエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | `https://www.shupass.jp` |
| `DATABASE_URL` | Yes | Supabase Postgres 接続URL（推奨: Pooler/6543） |
| `DIRECT_URL` | No | Supabase Postgres 直通URL（5432, マイグレーション推奨） |
| `SUPABASE_URL` | Yes | Supabase project URL。Storage API 呼び出しにも使用 |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase Storage 用 service role key |
| `BETTER_AUTH_SECRET` | Yes | 認証シークレット (32文字以上) |
| `BETTER_AUTH_URL` | Yes | `https://www.shupass.jp` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth クライアントID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth シークレット |
| `ENCRYPTION_KEY` | Yes | 暗号化キー (64桁hex) |
| `STRIPE_SECRET_KEY` | Yes | Stripe シークレットキー (`sk_live_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe 公開キー (`pk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe Webhook シークレット (`whsec_...`) |
| `STRIPE_PRICE_STANDARD_MONTHLY` | Yes | Standard 月額 Price ID (`price_...`) |
| `STRIPE_PRICE_PRO_MONTHLY` | Yes | Pro 月額 Price ID (`price_...`) |
| `FASTAPI_URL` | Yes | `https://career-compass-backend.up.railway.app` |
| `NEXT_PUBLIC_QWEN_ES_REVIEW_ENABLED` | No | `true` にすると Qwen3 ES添削 β の UI 導線を表示 |
| `CRON_SECRET` | Yes | Cron 認証トークン (hex 32) |
| `COMPANY_PDF_INGEST_BUCKET` | No | OCR保留PDFを置く Storage bucket 名。既定 `company-info-pdf-ingest` |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL (`https://xxx.upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST トークン |

## Railway (バックエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API キー (`sk-...`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API キー (`sk-ant-...`) |
| `GOOGLE_API_KEY` | No | Gemini API キー |
| `COHERE_API_KEY` | No | Cohere API キー |
| `DEEPSEEK_API_KEY` | No | DeepSeek API キー |
| `CORS_ORIGINS` | Yes | `["https://www.shupass.jp","https://shupass.jp"]` |
| `PORT` | No | Railway が自動注入することが多い。アプリは `${PORT:-8000}` で待受（ローカルは 8000） |
| `FRONTEND_URL` | No | 任意（ログ出力用）。例: `https://www.shupass.jp` |
| `CLAUDE_MODEL` | No | Claude Sonnet モデル名 (デフォルト: `claude-sonnet-4-5-20250929`) |
| `CLAUDE_HAIKU_MODEL` | No | Claude Haiku モデル名 (デフォルト: `claude-haiku-4-5-20251001`) |
| `OPENAI_MODEL` | No | OpenAI モデル名 (デフォルト: `gpt-5-mini`) |
| `GOOGLE_MODEL` | No | Gemini モデル名 (デフォルト: `gemini-3.1-pro-preview`) |
| `GOOGLE_BASE_URL` | No | Gemini API ベースURL (デフォルト: `https://generativelanguage.googleapis.com/v1beta`) |
| `COHERE_MODEL` | No | Cohere モデル名 (デフォルト: `command-a-03-2025`) |
| `COHERE_BASE_URL` | No | Cohere OpenAI compatibility ベースURL (デフォルト: `https://api.cohere.com/compatibility/v1`) |
| `DEEPSEEK_MODEL` | No | DeepSeek モデル名 (デフォルト: `deepseek-chat`) |
| `DEEPSEEK_BASE_URL` | No | DeepSeek OpenAI compatibility ベースURL (デフォルト: `https://api.deepseek.com/v1`) |
| `QWEN_ES_REVIEW_ENABLED` | No | `true` にすると FastAPI 側の `POST /api/es/review/qwen/stream` を有効化 |
| `QWEN_ES_REVIEW_BASE_URL` | No | vLLM / OpenAI-compatible 推論サービス URL。例: `https://<modal-app>.modal.run/v1` |
| `QWEN_ES_REVIEW_MODEL` | No | base model 名。例: `tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2` |
| `QWEN_ES_REVIEW_ADAPTER_ID` | No | vLLM の static LoRA alias。設定時はこちらを優先 |
| `QWEN_ES_REVIEW_API_KEY` | No | 推論サービス API key。ローカル閉域なら空でも可 |
| `QWEN_ES_REVIEW_TIMEOUT_SECONDS` | No | Qwen3 β の legacy 既定 timeout 秒。デフォルト `120` |
| `QWEN_ES_REVIEW_TIMEOUT_IMPROVEMENT_SECONDS` | No | improvement JSON の timeout 秒。デフォルト `30` |
| `QWEN_ES_REVIEW_TIMEOUT_REWRITE_SECONDS` | No | rewrite 1回目の timeout 秒。デフォルト `90` |
| `QWEN_ES_REVIEW_TIMEOUT_COMPACT_REWRITE_SECONDS` | No | timeout 後の compact rewrite retry の timeout 秒。デフォルト `45` |
| `QWEN_ES_REVIEW_TIMEOUT_LENGTH_FIX_SECONDS` | No | length-fix の timeout 秒。デフォルト `20` |
| `QWEN_ES_REVIEW_TOTAL_BUDGET_SECONDS` | No | 1リクエスト全体で Qwen に使う上限秒。デフォルト `150` |
| `MODEL_ES_REVIEW` | No | ES添削モデルエイリアスまたは明示モデルID。例: `claude-sonnet`, `gpt-5.1`, `gemini-3.1-pro-preview`, `command-a-03-2025`, `deepseek-chat` |
| `MODEL_GAKUCHIKA` | No | ガクチカ深掘りモデルティア (デフォルト: `claude-haiku`) |
| `MODEL_MOTIVATION` | No | 志望動機作成モデルティア (デフォルト: `claude-haiku`) |
| `MODEL_SELECTION_SCHEDULE` | No | 選考スケジュール抽出モデルティア (デフォルト: `claude-haiku`) |
| `MODEL_COMPANY_INFO` | No | 企業情報抽出モデルエイリアスまたは明示モデルID (デフォルト: `openai`) |
| `MODEL_RAG_QUERY_EXPANSION` | No | RAGクエリ拡張モデルティア (デフォルト: `claude-haiku`) |
| `MODEL_RAG_HYDE` | No | RAG仮想文書生成モデルティア (デフォルト: `claude-sonnet`) |
| `MODEL_RAG_RERANK` | No | RAG再ランキングモデルティア (デフォルト: `claude-sonnet`) |
| `MODEL_RAG_CLASSIFY` | No | RAGコンテンツ分類モデルティア (デフォルト: `claude-haiku`) |
| `OPENAI_EMBEDDING_MODEL` | No | 埋め込みモデル (デフォルト: `text-embedding-3-small`) |
| `EMBEDDING_MAX_INPUT_CHARS` | No | 埋め込み最大入力文字数 (デフォルト: `8000`) |
| `USE_HYBRID_SEARCH` | No | ハイブリッド検索の有効化 (デフォルト: `false`) |
| `DEBUG` | No | `false` |
| `COMPANY_SEARCH_DEBUG` | No | `false` |
| `WEB_SEARCH_DEBUG` | No | `false` |
| `REDIS_URL` | No | Redis キャッシュURL |

## Local / Modal (Qwen deploy tooling)

| 変数名 | 必須 | 説明 |
|---|---|---|
| `QWEN_MODAL_MODEL_NAME` | No | Modal 側で読む base model 名。既定: `tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2` |
| `QWEN_MODAL_SERVED_MODEL_NAME` | No | vLLM の served model 名。通常は base model と同じ |
| `QWEN_MODAL_ADAPTER_ALIAS` | No | static LoRA alias。既定: `es_review` |
| `QWEN_MODAL_ADAPTER_DIRNAME` | No | Modal volume 上の adapter directory 名 |
| `QWEN_MODAL_ADAPTER_REPO_ID` | No | Hugging Face の private adapter repo |
| `QWEN_MODAL_GPU` | No | Modal GPU 種別。Swallow 32B は `A100-80GB` 推奨 |
| `QWEN_MODAL_MAX_MODEL_LEN` | No | vLLM の `--max-model-len`。既定: `8192` |
| `QWEN_MODAL_PROFILE` | No | `interactive` または `throughput`。既定: `interactive` |
| `QWEN_MODAL_REASONING_PARSER` | No | interactive では空が既定、throughput では `qwen3` が既定 |
| `QWEN_MODAL_FAST_BOOT` | No | `true` なら eager 起動を優先。Swallow 32B 既定は `false` |
| `QWEN_MODAL_APP_NAME` | No | Modal app 名。既定: `career-compass-qwen-es-review-swallow-32b` |
