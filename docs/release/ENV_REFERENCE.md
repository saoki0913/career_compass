# 環境変数一覧（クイックリファレンス）

[← 目次に戻る](./PRODUCTION.md)

---

## Vercel (フロントエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | `https://www.shupass.jp` |
| `DATABASE_URL` | Yes | Supabase Postgres 接続URL（推奨: Pooler/6543） |
| `DIRECT_URL` | No | Supabase Postgres 直通URL（5432, マイグレーション推奨） |
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
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL (`https://xxx.upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST トークン |

## Railway (バックエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API キー (`sk-...`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API キー (`sk-ant-...`) |
| `CORS_ORIGINS` | Yes | `["https://www.shupass.jp","https://shupass.jp"]` |
| `PORT` | No | Railway が自動注入することが多い。アプリは `${PORT:-8000}` で待受（ローカルは 8000） |
| `FRONTEND_URL` | No | 任意（ログ出力用）。例: `https://www.shupass.jp` |
| `CLAUDE_MODEL` | No | Claude Sonnet モデル名 (デフォルト: `claude-sonnet-4-5-20250929`) |
| `CLAUDE_HAIKU_MODEL` | No | Claude Haiku モデル名 (デフォルト: `claude-haiku-4-5-20251001`) |
| `OPENAI_MODEL` | No | OpenAI モデル名 (デフォルト: `gpt-5-mini`) |
| `QWEN_ES_REVIEW_ENABLED` | No | `true` にすると FastAPI 側の `POST /api/es/review/qwen/stream` を有効化 |
| `QWEN_ES_REVIEW_BASE_URL` | No | vLLM / OpenAI-compatible 推論サービス URL。例: `http://qwen-es-review:8000/v1` |
| `QWEN_ES_REVIEW_MODEL` | No | base model 名。例: `Qwen/Qwen3-14B` |
| `QWEN_ES_REVIEW_ADAPTER_ID` | No | vLLM の static LoRA alias。設定時はこちらを優先 |
| `QWEN_ES_REVIEW_API_KEY` | No | 推論サービス API key。ローカル閉域なら空でも可 |
| `QWEN_ES_REVIEW_TIMEOUT_SECONDS` | No | Qwen3 β 呼び出しタイムアウト秒。デフォルト `120` |
| `MODEL_ES_REVIEW` | No | ES添削モデルティア (デフォルト: `claude-sonnet`) |
| `MODEL_GAKUCHIKA` | No | ガクチカ深掘りモデルティア (デフォルト: `claude-haiku`) |
| `MODEL_MOTIVATION` | No | 志望動機作成モデルティア (デフォルト: `claude-haiku`) |
| `MODEL_SELECTION_SCHEDULE` | No | 選考スケジュール抽出モデルティア (デフォルト: `claude-haiku`) |
| `MODEL_COMPANY_INFO` | No | 企業情報抽出モデルティア (デフォルト: `openai`) |
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
