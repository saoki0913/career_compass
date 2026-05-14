# 環境変数一覧（クイックリファレンス）

[← インデックス](../README.md)

---

## Vercel (フロントエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | `https://www.shupass.jp` |
| `DATABASE_URL` | Yes | Supabase Postgres 接続URL（推奨: Pooler/6543） |
| `DIRECT_URL` | No | Supabase Postgres 直通URL（5432, マイグレーション推奨） |
| `BETTER_AUTH_SECRET` | Yes | 認証シークレット (32文字以上) |
| `BETTER_AUTH_URL` | Yes | `https://www.shupass.jp` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Yes | `https://www.shupass.jp,https://shupass.jp` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth クライアントID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth シークレット |
| `ENCRYPTION_KEY` | Yes | 暗号化キー (64桁hex) |
| `STRIPE_SECRET_KEY` | Yes | Stripe シークレットキー (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe Webhook シークレット (`whsec_...`) |
| `STRIPE_PRICE_STANDARD_MONTHLY` | Yes | Standard 月額 Price ID (`price_...`) |
| `STRIPE_PRICE_STANDARD_ANNUAL` | Yes | Standard 年額 Price ID (`price_...`) |
| `STRIPE_PRICE_PRO_MONTHLY` | Yes | Pro 月額 Price ID (`price_...`) |
| `STRIPE_PRICE_PRO_ANNUAL` | Yes | Pro 年額 Price ID (`price_...`) |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Production required | Stripe Customer Portal configuration ID (`bpc_...`)。本番では意図しない Dashboard default drift を避けるため必須 |
| `FASTAPI_URL` | Yes | `https://shupass-backend-production.up.railway.app` |
| `INTERNAL_API_JWT_SECRET` | Yes | Next.js から FastAPI への内部呼び出し用 shared secret。32文字以上を推奨 |
| `CAREER_PRINCIPAL_HMAC_SECRET` | Yes | `X-Career-Principal` ヘッダ署名用 HMAC シークレット（BFF 側）。`INTERNAL_API_JWT_SECRET` とは独立して回転できるよう別管理。32文字以上を推奨。詳細は `docs/architecture/BFF_FASTAPI_CONTRACT.md` |
| `LOGO_DEV_TOKEN` | No | ダッシュボード企業アイコンの実ロゴ取得に使う Logo.dev image token。未設定時は legacy `NEXT_PUBLIC_LOGO_DEV_TOKEN` を互換 alias として読む |
| `LOGO_DEV_SECRET_KEY` | No | 企業名しかない場合に Logo.dev Brand Search API で domain 解決するための secret key |
| `BRANDFETCH_CLIENT_ID` | No | ダッシュボード企業アイコンの Brandfetch client ID。Logo.dev 取得失敗時の追加 fallback として server-side proxy で使用 |
| `CRON_SECRET` | Yes | Cron 認証トークン (hex 32) |
| `UPSTASH_REDIS_REST_URL` | Yes (deployed AI) | Upstash Redis REST URL (`https://xxx.upstash.io`)。local/dev は未設定でも in-memory fallback |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (deployed AI) | Upstash Redis REST トークン。Standard token は server env のみに設定 |
| `UPSTASH_REDIS_NAMESPACE` | Yes (shared Redis) | Redis key namespace。Free plan で 1 DB を共有する場合は production=`prod`, staging=`stg`, local=`local` のように必ず分離 |
| `DISABLE_TOKEN_LIMIT` | No | `true` で日次トークン上限チェック全体を無効化。緊急バイパス用 |

企業ロゴの取得率を上げるには `LOGO_DEV_TOKEN` を優先して設定します。企業名しかない登録データを domain lookup に寄せる場合は `LOGO_DEV_SECRET_KEY` も設定します。既存環境の `NEXT_PUBLIC_LOGO_DEV_TOKEN` / `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` は互換 alias として server-side proxy が読みますが、新規設定では server-only 名を使います。favicon は企業ロゴとして扱わず、provider でロゴが取れない場合は頭文字 avatar へ fallback します。

## Railway (バックエンド)

| 変数名 | 必須 | 本番値 / 説明 |
|---|---|---|
| `ENVIRONMENT` | Yes (deployed) | `staging` or `production`。fail-fast バリデーションのトリガー。未設定時は `development`（`RAILWAY_ENVIRONMENT_NAME` も alias として受付） |
| `OPENAI_API_KEY` | Yes | OpenAI API キー (`sk-...`)。RAG / 検索 / 企業情報で使用 |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API キー (`sk-ant-...`)。ES 添削 / 面接 / 下書きで使用 |
| `GOOGLE_API_KEY` | No | Gemini API キー |
| `GOOGLE_DOCUMENT_AI_PROJECT_ID` | No | Google Document AI の project ID |
| `GOOGLE_DOCUMENT_AI_LOCATION` | No | Google Document AI の location（例: `us`） |
| `GOOGLE_DOCUMENT_AI_PROCESSOR_ID` | No | Enterprise Document OCR processor ID |
| `GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON` | No | Document AI 呼び出し用 service account JSON の 1 行文字列 |
| `FIRECRAWL_API_KEY` | No | 選考スケジュール取得の HTML 抽出で使う Firecrawl API キー |
| `FIRECRAWL_BASE_URL` | No | Firecrawl API base URL（既定: `https://api.firecrawl.dev`） |
| `FIRECRAWL_TIMEOUT_SECONDS` | No | Firecrawl 呼び出しタイムアウト秒数（既定: `30`） |
| `MISTRAL_API_KEY` | No | 難しい IR 系 PDF の高精度 OCR 用 API キー |
| `CORS_ORIGINS` | Yes | `["https://www.shupass.jp","https://shupass.jp"]` |
| `INTERNAL_API_JWT_SECRET` | Yes | Next.js BFF からの service JWT 検証用 shared secret |
| `CAREER_PRINCIPAL_HMAC_SECRET` | Yes | `X-Career-Principal` ヘッダ署名検証用 HMAC シークレット（FastAPI 側）。BFF と同値を設定する。詳細は `docs/architecture/BFF_FASTAPI_CONTRACT.md` |
| `TENANT_KEY_SECRET` | Yes (deployed) | テナント鍵暗号化用シークレット。BFF と同値を設定。32 文字以上必須 |
| `BACKEND_TRUSTED_HOSTS` | No | 受け付ける Host 名。例: `["shupass-backend-production.up.railway.app","stg-api.shupass.jp","localhost","127.0.0.1"]` |
| `PORT` | No | Railway が自動注入することが多い。アプリは `${PORT:-8000}` で待受（ローカルは 8000） |
| `FRONTEND_URL` | No | 任意（ログ出力用）。例: `https://www.shupass.jp` |
| `CLAUDE_SONNET_MODEL` | No | Claude Sonnet モデル名 (デフォルト: `claude-sonnet-4-6`) |
| `CLAUDE_HAIKU_MODEL` | No | Claude Haiku モデル名 (デフォルト: `claude-haiku-4-5-20251001`) |
| `GPT_MODEL` | No | OpenAI 標準モデル名 (デフォルト: `gpt-5.4`) |
| `GPT_MINI_MODEL` | No | OpenAI mini モデル名 (デフォルト: `gpt-5.4-mini`、旧名 `GPT_FAST_MODEL` も後方互換で有効) |
| `GPT_NANO_MODEL` | No | OpenAI 最廉価系モデル名 (デフォルト: `gpt-5.4-nano`、選考スケジュール既定で使用) |
| `LOW_COST_REVIEW_MODEL` | No | ES添削の専用 low-cost repair model (デフォルト: `claude-haiku-4-5-20251001`) |
| `GOOGLE_MODEL` | No | Gemini モデル名 (デフォルト: `gemini-3.1-pro-preview`) |
| `GOOGLE_BASE_URL` | No | Gemini API ベースURL (デフォルト: `https://generativelanguage.googleapis.com/v1beta`) |
| `MODEL_ES_REVIEW` | No | ES添削モデルエイリアスまたは明示モデルID。例: `claude-sonnet`, `gpt`, `gemini`, `low-cost`, `gpt-5.4` |
| `MODEL_GAKUCHIKA` | No | ガクチカ作成モデルティア (デフォルト: `claude-haiku` → Claude Haiku 4.5) |
| `MODEL_GAKUCHIKA_DRAFT` | No | ガクチカ ES 下書き生成 (デフォルト: `claude-sonnet` → Sonnet 4.6) |
| `MODEL_MOTIVATION` | No | 志望動機作成モデルティア (デフォルト: `claude-haiku` → Claude Haiku 4.5) |
| `MODEL_MOTIVATION_DRAFT` | No | 志望動機 ES 下書き生成 (デフォルト: `claude-sonnet` → Sonnet 4.6) |
| `MODEL_INTERVIEW` | No | 企業特化模擬面接モデルティア (デフォルト: `claude-haiku` → Claude Haiku 4.5) |
| `MODEL_INTERVIEW_PLAN` | No | 面接計画生成モデルティア (デフォルト: `gpt` → GPT-5.4) |
| `MODEL_SELECTION_SCHEDULE` | No | 選考スケジュール抽出モデルティア (デフォルト: `gpt-mini` → GPT-5.4 mini) |
| `MODEL_COMPANY_INFO` | No | 企業情報抽出モデルエイリアスまたは明示モデルID (デフォルト: `gpt-mini` → GPT-5.4 mini) |
| `MODEL_RAG_QUERY_EXPANSION` | No | RAGクエリ拡張 (デフォルト: `gpt-mini` = GPT-5.4 mini) |
| `MODEL_RAG_HYDE` | No | RAG HyDE (デフォルト: `gpt-mini`) |
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
| `WEB_SEARCH_FAST_MAX_QUERIES` | No | Hybrid search の fast path で使う query variation 数。実運用で体感速度と recall を比較調整する用（デフォルト: `4`） |
| `DEBUG` | No | `false` |
| `COMPANY_SEARCH_DEBUG` | No | `false` |
| `WEB_SEARCH_DEBUG` | No | `false` |
| `REDIS_URL` | No | Redis キャッシュURL |
| `RAG_PDF_MAX_PAGES_FREE` / `STANDARD` / `PRO` | No | 企業RAG PDF 取込の最大ページ（超過は先頭のみ）。既定 20 / 100 / 200 |
| `RAG_PDF_GOOGLE_OCR_MAX_PAGES_FREE` / `STANDARD` / `PRO` | No | Google Document AI OCR 実行時の最大ページ。既定 5 / 50 / 100（旧名 `RAG_PDF_OCR_MAX_PAGES_*` も alias 受付） |
| `RAG_PDF_MISTRAL_OCR_MAX_PAGES_FREE` / `STANDARD` / `PRO` | No | Mistral 高精度 OCR の最大ページ。既定 0 / 15 / 30 |
| `PDF_OCR_TIMEOUT_SECONDS` | No | PDF OCR の同期タイムアウト秒（既定 120、未設定時は `RAG_PDF_OCR_TIMEOUT_SECONDS` も参照） |
| `PDF_OCR_MIN_TOTAL_CHARS` | No | `pypdf` 抽出がこの文字数未満なら OCR 実行（既定 200） |
| `PDF_OCR_MIN_CHARS_PER_PAGE` | No | `pypdf` の 1 ページ平均文字数がこの値未満なら OCR 実行（既定 120） |
| `PDF_OCR_HIGH_ACCURACY_MIN_PAGES` | No | Mistral 高精度 OCR に昇格する最小ページ数（既定 8） |
| `PDF_OCR_GOOGLE_WEAK_CHARS_PER_PAGE` | No | Google OCR 結果が弱いとみなす 1 ページ平均文字数（既定 250） |
| `PDF_OCR_GOOGLE_WEAK_QUALITY_SCORE` | No | Google OCR 結果が弱いとみなす平均 quality score（既定 0.65） |
| `COMPANY_PDF_INGEST_TELEMETRY_LOG` | No | `true` で PDF 取込 1 行テレメトリ（OCR 有無・ページ・秒・概算 USD）を `logger.info` |
| `SENTRY_DSN` | No (推奨) | Sentry DSN。本番未設定時は warning |
| `SENTRY_ENVIRONMENT` | No | Sentry に送る環境名。未設定時は `ENVIRONMENT` の値を使用 |
| `SENTRY_RELEASE` | No | Sentry リリースタグ |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Sentry traces サンプルレート（0.0〜1.0） |
| `RAG_METRICS_EXPORTER_ENABLED` | No | `true` で RAG メトリクス Prometheus exporter 有効 |
| `RAG_METRICS_EXPORTER_HOST` | No | メトリクスサーバーホスト（既定: `127.0.0.1`） |
| `RAG_METRICS_EXPORTER_PORT` | No | メトリクスサーバーポート（既定: `9464`） |
| `MOTIVATION_MAX_TURNS` | No | 志望動機会話の最大ターン数 |
| `MOTIVATION_REQUIRE_COMPANY` | No | `true` で企業未選択時の志望動機作成を拒否 |
| `MOTIVATION_DRAFT_AUTO_GENERATE` | No | `true` で会話完了時に自動下書き生成 |
| `MOTIVATION_QUESTION_BUDGET` | No | 志望動機 AI の質問予算 |
| `MOTIVATION_NEXT_QUESTION_HINT` | No | `true` で次の質問ヒントを表示 |
| `CONTEXTUAL_RETRIEVAL_ENABLED` | No | `true` でコンテキスト付き RAG 検索有効 |
| `CONTEXTUAL_RETRIEVAL_TOP_K` | No | コンテキスト検索の top-k 件数 |
| `REFERENCE_ES_RAG_ENABLED` | No | `true` で参考 ES の RAG 検索有効 |

## Environment Profiles

| 環境 | Frontend URL | Backend URL | Better Auth trusted origins |
|---|---|---|---|
| local | `http://localhost:3000` | `http://localhost:8000` | `http://localhost:3000,http://127.0.0.1:3000` |
| staging | `https://stg.shupass.jp` | `https://stg-api.shupass.jp` | `https://stg.shupass.jp` |
| production | `https://www.shupass.jp` | Railway の本番ドメイン | `https://www.shupass.jp,https://shupass.jp` |

## Release Automation Inputs（正本は Git 管理外）

プロバイダ向け env の**実ファイル**はリポジトリに置かない。正本は **プロジェクトローカルの `.secrets/`** ディレクトリ（gitignored）。

**SSOT 解決順序**（最優先から）:
1. `--secret-dir PATH` or `CAREER_COMPASS_SECRETS_DIR` — 明示指定
2. `${repo_root}/.secrets` — **プライマリ SSOT**（通常はこちら）
3. `${CODEX_COMPANY_SECRETS_ROOT}/career_compass` — codex-company レガシーフォールバック

ルートの決め方は [`scripts/release/career-compass-secrets-root.sh`](../../../scripts/release/career-compass-secrets-root.sh) と `sync-career-compass-secrets.sh` 先頭コメントと同じ。

旧フラットレイアウト（codex-company 用）とサブディレクトリレイアウト（`.secrets/` 用）は sync スクリプトが自動判別する。

| 新パス（サブディレクトリ） | 旧パス（フラット） | 用途 |
|---|---|---|
| `staging/nextjs.env` | `vercel-staging.env` | staging frontend env sync |
| `production/nextjs.env` | `vercel-production.env` | production frontend env sync |
| `staging/fastapi.env` | `railway-staging.env` | staging backend env sync |
| `production/fastapi.env` | `railway-production.env` | production backend env sync |
| `ci/github-actions.env` | `github-actions.env` | GitHub Actions secrets |
| `production/supabase.env` | `supabase.env` | Supabase bootstrap inputs |
| `infra/cloudflare.env` | `cloudflare.env` | zone bootstrap inputs |
| `<secrets root>/google-oauth/career_compass.env` | 同左 | Google OAuth inventory |

**shared.env の整合性検証**: sync スクリプトは `{env}/shared.env` に定義されたキーが `nextjs.env` と `fastapi.env` の両方に存在する場合、値が一致していることを自動検証する。不一致があれば sync が中断される。

補足:
- staging / preview の CI test auth は `CI_E2E_AUTH_SECRET` が設定されていれば有効。
- `sync-career-compass-secrets.sh --apply --target vercel-staging` は `staging/nextjs.env` の通常 key に加えて、`ci/github-actions.env` にある `CI_E2E_AUTH_SECRET` / `CI_E2E_AUTH_ENABLED` / `PLAYWRIGHT_BASE_URL` を staging frontend へ overlay する。
- 明示的に止めたい場合のみ frontend env に `CI_E2E_AUTH_ENABLED=0` を入れる。

## .secrets/ ディレクトリ構造

プロジェクト内の `.secrets/` (gitignored) に環境×サービス別でシークレットを管理する。

```
.secrets/
├── production/
│   ├── nextjs.env        # Vercel production
│   ├── fastapi.env       # Railway production
│   ├── supabase.env      # DB bootstrap
│   └── shared.env        # 3 cross-service vars
├── staging/
│   ├── nextjs.env        # Vercel staging
│   ├── fastapi.env       # Railway staging
│   ├── supabase.env
│   └── shared.env
├── ci/
│   └── github-actions.env
├── infra/
│   └── cloudflare.env
└── shared-vars.json      # SSOT manifest
```

### T3 Env 型安全アクセスパターン

Next.js コードから環境変数にアクセスする場合は `src/env/server.ts` / `src/env/client.ts` を使用する:

```typescript
import { serverEnv } from "@/env/server";
const dbUrl = serverEnv.DATABASE_URL;  // validated, typed
```

`skipValidation` は `SKIP_ENV_VALIDATION=1 && NODE_ENV !== "production"` のとき**のみ**有効。本番では常にバリデーション実行。

## 移行

codex-company からの移行:

```bash
bash scripts/release/migrate-secrets.sh --check    # ドライラン
bash scripts/release/migrate-secrets.sh --migrate   # 実行
```

## Sync Commands

- auth 確認: `zsh scripts/release/provider-auth-status.sh --strict`
- env / secrets 確認: `make ops-secrets-sync`
- env / secrets 同期: `SYNC_MODE=--apply TARGET=all make ops-secrets-sync`
- script 直実行: `zsh scripts/release/sync-career-compass-secrets.sh --check|--apply --target <target>`
- Vercel production のみ同期: `zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-production --vercel-env production`
- infra bootstrap check: `zsh scripts/bootstrap-career-compass-infra.sh --check`

`--check` は secret 値を比較・表示せず、bundle 側と provider 側の key set だけを照合します。bundle にある key が provider にない場合は release を止め、provider 側だけにある key は warning として出します。Vercel は `--vercel-env production|preview|both` で同期・確認先を指定できます。既定は後方互換のため `both` です。staging Vercel は `github-actions.env` の `CI_E2E_AUTH_SECRET` / `CI_E2E_AUTH_ENABLED` / `PLAYWRIGHT_BASE_URL` overlay も expected key に含めます。

## 環境共有戦略（Free プラン制約）

### サービス別共有状態

| サービス | プラン | 共有状態 | 分離推奨条件 |
|---|---|---|---|
| Supabase (PostgreSQL) | Free | staging/prod 同一 DB | 有料化時に即分離（最優先） |
| Upstash Redis | Free | 1 DB + namespace 分離 | 有料化時に DB 分離。共有時は `UPSTASH_REDIS_NAMESPACE` 必須 |
| OpenAI / Anthropic API | 従量課金 | dev/staging 同一キー | staging 負荷テスト導入時に分離 |
| Google OAuth | Free | 全環境同一クライアント | 分離不要（redirect URI で環境分離済み） |
| Stripe | テストモード | dev/staging 同一テストキー | ステージング QA 強化時 |
| Sentry | Free | 全環境同一プロジェクト | `environment` タグで論理分離済み。分離不要 |
| Resend | Free | 全環境共有 | 送信量増加時 |

### Supabase 共有 DB の安全運用ガイドライン

staging と production が同一 Supabase プロジェクトを共有しているため、staging での操作が本番データに影響する。

**安全な操作（staging で実行可）:**
- DB の閲覧（SELECT）
- 認証フロー（Better Auth — ユーザーテーブルは `environment` で論理分離）
- Stripe 操作（テストモードキーのみ使用）
- RAG / ChromaDB 操作（Supabase DB とは独立）

**危険な操作（staging での実行を避ける）:**
- DB マイグレーション（`db:push`, `db:migrate`） → production deploy からのみ実行
- `DELETE` / `UPDATE` を伴う E2E テスト → テストデータには一意の prefix を付与し、テスト後に必ずクリーンアップ
- Cron ジョブの手動トリガー → 本番データの通知・締切処理が発火する可能性

**推奨プラクティス:**
- DB マイグレーションは production deploy パイプラインからのみ実行
- staging での E2E テストデータには `[STG-TEST]` prefix を付与
- staging 環境の `ENVIRONMENT=staging` を必ず設定（コード内の環境判定に使用）
- 共有リスクが許容できなくなった場合は Supabase Pro プラン（$25/月）で即座に分離可能

## Secret Rotation Checklist

- `.env.local` や provider dashboard に実値が露出した場合は、同じ値を継続使用しない。
- `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `STRIPE_*`, `INTERNAL_API_JWT_SECRET` は優先的に rotate する。
- rotate 後は `sync-career-compass-secrets.sh --check` で Vercel / Railway / GitHub Actions / Supabase の差分を確認する。
- guest cookie は server 発行なので、client の localStorage cleanup だけでは復旧にならない。漏えい時は DB 上の guest token hash も失効対象に含める。
