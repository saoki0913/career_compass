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
| `BETTER_AUTH_TRUSTED_ORIGINS` | Yes | `https://www.shupass.jp,https://shupass.jp` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth クライアントID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth シークレット |
| `ENCRYPTION_KEY` | Yes | 暗号化キー (64桁hex) |
| `STRIPE_SECRET_KEY` | Yes | Stripe シークレットキー (`sk_live_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe 公開キー (`pk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe Webhook シークレット (`whsec_...`) |
| `STRIPE_PRICE_STANDARD_MONTHLY` | Yes | Standard 月額 Price ID (`price_...`) |
| `STRIPE_PRICE_PRO_MONTHLY` | Yes | Pro 月額 Price ID (`price_...`) |
| `FASTAPI_URL` | Yes | `https://career-compass-backend.up.railway.app` |
| `CRON_SECRET` | Yes | Cron 認証トークン (hex 32) |
| `COMPANY_PDF_INGEST_BUCKET` | No | 旧 deferred OCR 用 Storage。遅延 OCR 廃止後は主に互換・掃除用 |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL (`https://xxx.upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST トークン |

## Railway (バックエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API キー (`sk-...`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API キー (`sk-ant-...`) |
| `GOOGLE_API_KEY` | No | Gemini API キー |
| `CORS_ORIGINS` | Yes | `["https://www.shupass.jp","https://shupass.jp"]` |
| `PORT` | No | Railway が自動注入することが多い。アプリは `${PORT:-8000}` で待受（ローカルは 8000） |
| `FRONTEND_URL` | No | 任意（ログ出力用）。例: `https://www.shupass.jp` |
| `CLAUDE_SONNET_MODEL` | No | Claude Sonnet モデル名 (デフォルト: `claude-sonnet-4-6`) |
| `CLAUDE_HAIKU_MODEL` | No | Claude Haiku モデル名 (デフォルト: `claude-haiku-4-5-20251001`) |
| `GPT_MODEL` | No | OpenAI 標準モデル名 (デフォルト: `gpt-5.4`) |
| `GPT_FAST_MODEL` | No | OpenAI 高速モデル名 (デフォルト: `gpt-5.4-mini`) |
| `GPT_NANO_MODEL` | No | OpenAI 最廉価系モデル名 (デフォルト: `gpt-5.4-nano`、選考スケジュール既定で使用) |
| `LOW_COST_REVIEW_MODEL` | No | ES添削の専用 low-cost repair model (デフォルト: `gpt-5.4-mini`) |
| `GOOGLE_MODEL` | No | Gemini モデル名 (デフォルト: `gemini-3.1-pro-preview`) |
| `GOOGLE_BASE_URL` | No | Gemini API ベースURL (デフォルト: `https://generativelanguage.googleapis.com/v1beta`) |
| `MODEL_ES_REVIEW` | No | ES添削モデルエイリアスまたは明示モデルID。例: `claude-sonnet`, `gpt`, `gemini`, `low-cost`, `gpt-5.4` |
| `MODEL_GAKUCHIKA` | No | ガクチカ深掘りモデルティア (デフォルト: `gpt-fast` → GPT-5.4 mini) |
| `MODEL_GAKUCHIKA_DRAFT` | No | ガクチカ ES 下書き生成 (デフォルト: `claude-sonnet` → Sonnet 4.6) |
| `MODEL_MOTIVATION` | No | 志望動機作成モデルティア (デフォルト: `gpt-fast` → GPT-5.4 mini) |
| `MODEL_MOTIVATION_DRAFT` | No | 志望動機 ES 下書き生成 (デフォルト: `claude-sonnet` → Sonnet 4.6) |
| `MODEL_SELECTION_SCHEDULE` | No | 選考スケジュール抽出モデルティア (デフォルト: `gpt-nano` → GPT-5.4 nano) |
| `MODEL_COMPANY_INFO` | No | 企業情報抽出モデルエイリアスまたは明示モデルID (デフォルト: `openai`) |
| `MODEL_RAG_QUERY_EXPANSION` | No | RAGクエリ拡張 (デフォルト: `gpt-fast` = GPT-5.4 mini) |
| `MODEL_RAG_HYDE` | No | RAG HyDE (デフォルト: `gpt-fast`) |
| `MODEL_RAG_CLASSIFY` | No | RAGコンテンツ分類のみ nano 既定 (デフォルト: `gpt-nano`) |
| `LLM_USAGE_COST_LOG` | No | `true` で選考スケジュール取得などの LLM トークン集計を FastAPI ログに出す（ユーザー向け UI には出さない） |
| `OPENAI_PRICE_GPT_5_4_MINI_INPUT_PER_MTOK_USD` | No | ログ用概算 USD: 入力 $/1M tokens（未設定なら est_usd なし） |
| `OPENAI_PRICE_GPT_5_4_MINI_CACHED_INPUT_PER_MTOK_USD` | No | 同上: キャッシュヒット入力 $/1M（省略時は input 単価） |
| `OPENAI_PRICE_GPT_5_4_MINI_OUTPUT_PER_MTOK_USD` | No | 同上: 出力 $/1M |
| `OPENAI_PRICE_GPT_5_4_NANO_INPUT_PER_MTOK_USD` | No | ログ用概算 USD: GPT-5.4 nano 入力 $/1M（未設定なら内蔵カタログ） |
| `OPENAI_PRICE_GPT_5_4_NANO_CACHED_INPUT_PER_MTOK_USD` | No | 同上: キャッシュヒット入力 $/1M |
| `OPENAI_PRICE_GPT_5_4_NANO_OUTPUT_PER_MTOK_USD` | No | 同上: 出力 $/1M |
| `LLM_COST_USD_TO_JPY_RATE` | No | `est_usd` に掛けてログに `est_jpy` を付与（例: `155`）。単価 env と併用 |
| `OPENAI_EMBEDDING_MODEL` | No | 埋め込みモデル (デフォルト: `text-embedding-3-small`) |
| `EMBEDDING_MAX_INPUT_CHARS` | No | 埋め込み最大入力文字数 (デフォルト: `8000`) |
| `USE_HYBRID_SEARCH` | No | ハイブリッド検索の有効化 (デフォルト: `false`) |
| `DEBUG` | No | `false` |
| `COMPANY_SEARCH_DEBUG` | No | `false` |
| `WEB_SEARCH_DEBUG` | No | `false` |
| `REDIS_URL` | No | Redis キャッシュURL |
| `RAG_PDF_MAX_PAGES_FREE` / `STANDARD` / `PRO` | No | 企業RAG PDF 取込の最大ページ（超過は先頭のみ）。既定 24 / 72 / 120 |
| `RAG_PDF_OCR_MAX_PAGES_FREE` / `STANDARD` / `PRO` | No | OpenAI PDF OCR 時の最大ページ。既定 10 / 32 / 48 |
| `RAG_PDF_OCR_TIMEOUT_SECONDS` | No | PDF OCR の同期タイムアウト秒（既定 120） |
| `COMPANY_PDF_INGEST_TELEMETRY_LOG` | No | `true` で PDF 取込 1 行テレメトリ（OCR 有無・ページ・秒・概算 USD）を `logger.info` |

## Environment Profiles

| 環境 | Frontend URL | Backend URL | Better Auth trusted origins |
|---|---|---|---|
| local | `http://localhost:3000` | `http://localhost:8000` | `http://localhost:3000,http://127.0.0.1:3000` |
| staging | `https://stg.shupass.jp` | `https://stg-api.shupass.jp` | `https://stg.shupass.jp` |
| production | `https://www.shupass.jp` | Railway の本番ドメイン | `https://www.shupass.jp,https://shupass.jp` |

## Release Automation Inputs

release automation の secrets 正本は `/Users/saoki/work/codex-company/.secrets/career_compass`。

| ファイル | 用途 |
|---|---|
| `vercel-staging.env` | staging frontend env sync |
| `vercel-production.env` | production frontend env sync |
| `railway-staging.env` | staging backend env sync |
| `railway-production.env` | production backend env sync |
| `github-actions.env` | GitHub Actions の `Dependency Review` / `CodeQL` / `Main Release Gate` 用 secrets（`CI_E2E_AUTH_SECRET`, LLM keys など） |
| `supabase.env` | Supabase bootstrap inputs |
| `cloudflare.env` | `stg-api.shupass.jp` を含む zone bootstrap inputs |
| `../google-oauth/career_compass.env` | Google OAuth inventory |

## Sync Commands

- auth 確認: `zsh scripts/release/provider-auth-status.sh --strict`
- env / secrets 同期: `zsh scripts/release/sync-career-compass-secrets.sh --check|--apply`
- infra bootstrap check: `zsh scripts/bootstrap-career-compass-infra.sh --check`
